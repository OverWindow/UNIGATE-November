import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[2] / "deploy" / "backup-db.sh"
FAKE_TOOLS = r'''
date() {
    [[ $TZ == Asia/Seoul ]] || return 1
    case "$1" in
        +%Y/%m/%d) echo 2026/11/27 ;;
        +%Y/%m/%d/%H%M%S) echo 2026/11/27/030000 ;;
        *) echo 2026-11-27T03:00:00+09:00 ;;
    esac
}
pg_dump() {
    echo dump >> calls
    echo "$PGPASSWORD" >&2
    [[ $PGPASSWORD == "$DB_PASSWORD" && $PGSSLMODE == require ]] || return 1
    [[ $1 == --no-password && $2 == --format=custom && $3 == --file=* ]] || return 1
    printf archive > "${3#--file=}"
    [[ $FAIL != dump ]]
}
aws() {
    echo "$DB_PASSWORD" >&2
    [[ $# == 5 && $1 == s3 && $2 == cp && $5 == --only-show-errors ]] || return 1
    [[ $(cat "$3") == archive ]] || return 1
    echo "$4" >> calls
    [[ $FAIL != upload ]]
}
'''


@unittest.skipUnless(sys.platform.startswith("linux"), "backup entry point runs on Linux")
class BackupCommandTests(unittest.TestCase):
    def setUp(self):
        scope = tempfile.TemporaryDirectory()
        self.addCleanup(scope.cleanup)
        self.work = Path(scope.name)
        self.temp = self.work / "temp"
        self.temp.mkdir()
        self.tools = self.work / "tools.sh"
        self.tools.write_text(FAKE_TOOLS)

    def backup(self, mode, fail="", prefix=""):
        env = dict(PATH=os.defpath, BASH_ENV=str(self.tools), TMPDIR=str(self.temp),
                   DB_NAME="fixture", DB_USER="fixture", DB_HOST="invalid", DB_PORT="5432",
                   DB_PASSWORD="synthetic-secret", DB_SSLMODE="require", DB_BACKUP_S3_BUCKET="fixture",
                   DB_BACKUP_S3_PREFIX=prefix, FAIL=fail)
        result = subprocess.run(["bash", SCRIPT, mode], cwd=self.work, env=env,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, timeout=5)
        self.assertNotIn(env["DB_PASSWORD"], result.stdout)
        self.assertEqual(list(self.temp.iterdir()), [])
        return result

    def test_daily_uses_the_korean_date_and_default_prefix(self):
        result = self.backup("daily")
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("completed: archive uploaded", result.stdout)
        self.assertEqual((self.work / "calls").read_text().splitlines(),
                         ["dump", "s3://fixture/unigate/prod/daily/2026/11/27/database.dump"])

    def test_manual_keys_remain_unique_within_one_second(self):
        for _ in range(2):
            result = self.backup("manual", prefix="my-backups/")
            self.assertEqual(result.returncode, 0, result.stdout)
        keys = (self.work / "calls").read_text().splitlines()[1::2]
        self.assertEqual(len(set(keys)), 2)
        for key in keys:
            self.assertRegex(key, r"^s3://fixture/my-backups/manual/2026/11/27/030000-[0-9a-f-]{36}\.dump$")

    def test_dump_and_upload_failures(self):
        calls = self.work / "calls"
        result = self.backup("daily", fail="dump")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("failed: pg_dump", result.stdout)
        self.assertEqual(calls.read_text().splitlines(), ["dump"])
        calls.unlink()
        result = self.backup("manual", fail="upload")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("failed: S3 upload", result.stdout)
        self.assertNotIn("completed:", result.stdout)
        self.assertEqual(len(calls.read_text().splitlines()), 2)
