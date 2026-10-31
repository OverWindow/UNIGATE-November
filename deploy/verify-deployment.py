"""Run against a locally built image; creates and removes only unique test resources."""
import argparse
import http.client
import json
import os
import secrets
import subprocess
import time
import uuid

parser = argparse.ArgumentParser()
parser.add_argument("--image", default="unigate-deploy-test")
args = parser.parse_args()
tag = "unigate-check-" + uuid.uuid4().hex[:12]
volume = tag + "-data"
containers = []
env = os.environ.copy()
env["DJANGO_SECRET_KEY"] = secrets.token_urlsafe(48)


def docker(*parts):
    return subprocess.check_output(["docker", *parts], env=env, text=True, stderr=subprocess.STDOUT).strip()


def request(port, path, body=None, headers=None):
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
    conn.request("POST" if body is not None else "GET", path, body, headers or {})
    response = conn.getresponse()
    result = response.status, dict(response.getheaders()), response.read()
    conn.close()
    return result


def launch(suffix, mounted=True):
    name = tag + suffix
    containers.append(name)
    command = ["run", "-d", "--name", name, "-p", "127.0.0.1::8080",
               "-e", "DJANGO_SECRET_KEY", "-e", "DJANGO_ALLOWED_HOSTS=127.0.0.1",
               "-e", "DJANGO_TRUST_PROXY=1", "-e", "PUBLIC_SCHEME=https"]
    if mounted:
        command += ["-v", volume + ":/app/backend/data"]
    docker(*command, args.image)
    return name


def wait_ready(name):
    port = int(docker("port", name, "8080/tcp").rsplit(":", 1)[1])
    for _ in range(45):
        if docker("inspect", "--format", "{{.State.Running}}", name) != "true":
            raise RuntimeError(docker("logs", name))
        try:
            if request(port, "/api/health/")[0] == 200:
                return port
        except (OSError, http.client.HTTPException):
            pass
        time.sleep(0.5)
    raise RuntimeError("Container did not become ready: " + name)


try:
    docker("volume", "create", volume)
    docker("run", "--rm", "--user", "0", "-v", volume + ":/app/backend/data",
           "--entrypoint", "sh", args.image, "-c", "chown 1000:1000 /app/backend/data")
    missing = launch("-missing", False)
    assert docker("wait", missing) != "0"
    assert "Mount persistent storage" in docker("logs", missing)
    print("Missing volume rejected.", flush=True)
    first = launch("-first")
    port = wait_ready(first)
    assert request(port, "/")[0] == 200
    status, headers, body = request(port, "/api/csrf/")
    assert status == 200 and "Secure" in headers["Set-Cookie"]
    token = json.loads(body)["csrfToken"]
    payload = json.dumps({"email": "deployment-test@example.com", "age": 20,
                          "education_type": "universitas"})
    assert request(port, "/api/survey-responses/", payload,
                   {"Content-Type": "application/json"})[0] == 403
    assert request(port, "/api/survey-responses/", payload, {
        "Content-Type": "application/json", "X-CSRFToken": token,
        "Cookie": headers["Set-Cookie"].split(";", 1)[0],
        "Origin": "https://127.0.0.1:" + str(port),
    })[0] == 201
    docker("stop", first)
    docker("rm", first)
    containers.remove(first)
    second = launch("-second")
    wait_ready(second)
    count = docker("exec", second, "python", "-c",
                   "import sqlite3; c=sqlite3.connect('data/db.sqlite3'); print(c.execute('select count(*) from survey_responses').fetchone()[0])")
    assert count == "1"
    print("Homepage, HTTPS CSRF submission and redeployment persistence: OK.", flush=True)
    docker("exec", second, "python", "-c",
           "import os,signal; os.kill(int(open('/tmp/gunicorn.pid').read()),signal.SIGTERM)")
    docker("wait", second)
    print("Server exit shuts down the container: OK.", flush=True)
    # Simulate an inconsistent migration history only in this disposable test DB.
    docker("run", "--rm", "-v", volume + ":/app/backend/data", "--entrypoint", "python", args.image,
           "-c", "import sqlite3; c=sqlite3.connect('data/db.sqlite3'); c.execute('delete from django_migrations'); c.commit()")
    failed = launch("-migration-failure")
    assert docker("wait", failed) != "0"
    assert "Pre-migration backup completed" in docker("logs", failed)
    docker("run", "--rm", "-v", volume + ":/app/backend/data", "--entrypoint", "python", args.image,
           "-c", "import pathlib,sqlite3; p=list(pathlib.Path('data/backups').glob('*.sqlite3')); assert len(p)==1; c=sqlite3.connect(p[0]); assert c.execute('select count(*) from survey_responses').fetchone()[0]==1")
    print("Migration failure prevents startup; pre-migration backup is recoverable: OK.", flush=True)
finally:
    for name in containers:
        subprocess.run(["docker", "rm", "-f", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(["docker", "volume", "rm", volume], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
