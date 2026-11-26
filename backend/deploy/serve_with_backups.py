import signal
import subprocess
import sys
import time


def signal_backup_session(process, sig):
    # Supercronic puts each job in its own process group within this session.
    subprocess.run(["pkill", f"-{sig.name}", "-s", str(process.pid)], check=False)


def serve(web_command):
    stopping = False

    def stop(*_):
        nonlocal stopping
        stopping = True

    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGQUIT):
        signal.signal(sig, stop)

    web = subprocess.Popen(web_command)
    scheduler = None
    catch_up = None
    restart_at = 0
    try:
        while not stopping and web.poll() is None:
            if catch_up is not None and catch_up.poll() is not None:
                catch_up = None
            if scheduler is not None and scheduler.poll() is not None:
                print(f"Backup scheduler exited ({scheduler.returncode}), retrying in 30s.", file=sys.stderr)
                signal_backup_session(scheduler, signal.SIGTERM)
                scheduler = None
                restart_at = time.monotonic() + 30
            if scheduler is None and time.monotonic() >= restart_at:
                try:
                    scheduler = subprocess.Popen(
                        ["supercronic", "-no-reap", "-passthrough-logs", "/app/backend/deploy/backup.cron"],
                        start_new_session=True,
                    )
                    if catch_up is None:
                        catch_up = subprocess.Popen(
                            ["/app/backend/deploy/backup-db.sh", "catch-up"],
                            start_new_session=True,
                        )
                except OSError as error:
                    print(f"Backup process could not start: {error.strerror}", file=sys.stderr)
                    restart_at = time.monotonic() + 30
            time.sleep(1)
    finally:
        if web.poll() is None:
            web.terminate()
        backups = [process for process in (scheduler, catch_up) if process is not None]
        for process in backups:
            signal_backup_session(process, signal.SIGTERM)
        deadline = time.monotonic() + 30
        for process in (web, *backups):
            try:
                process.wait(timeout=max(0, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                if process is web:
                    web.kill()
                else:
                    signal_backup_session(process, signal.SIGKILL)
                process.wait()
    return web.returncode if web.returncode >= 0 else 128 - web.returncode


if __name__ == "__main__":
    sys.exit(serve(sys.argv[1:]))
