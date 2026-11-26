import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[2] / "deploy" / "backup-db.sh"
FAKE_TOOLS = r'''
backup_pid=$$
date() {
    case "$1" in
        '+%Y/%m/%d %H%M%S') echo "2026/11/27 ${FIXTURE_HOUR:-03}0000" ;;
        '+%Y/%m/%d') echo 2026/11/27 ;;
        *) echo 2026-11-27T03:00:00+0900 ;;
    esac
}
sleep() { echo "$1" >> waits; }
pg_dump() {
    echo dump >> calls
    echo "$PGPASSWORD" >&2
    [[ $FAIL != dump && $1 == --no-password && $2 == --format=custom ]] || return 1
    printf 'archive' > "${3#--file=}"
}
pg_restore() { [[ $1 == --list && -s $2 ]]; }
aws() {
    local key=unigate/prod/daily/2026/11/27/database.dump
    echo "$DB_PASSWORD" >&2
    case "$1 $2" in
        's3api list-objects-v2')
            [[ $FAIL != list && $6 == "$key" ]] || return 1
            if [[ -f object ]]; then printf '%s\t7\n' "$key"; else echo None; fi ;;
        's3 cp')
            [[ $4 == "s3://fixture/$key" && $5 == --checksum-algorithm && $6 == CRC32 ]] || return 1
            if [[ $FAIL == interrupt ]]; then
                command sleep 0.05
                kill -TERM "$backup_pid"
                exec /bin/sleep 10
            fi
            cp "$3" object && echo uploaded >> calls ;;
        *) return 1 ;;
    esac
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

    def backup(self, mode="daily", fail="", hour="03"):
        env = dict(PATH=os.defpath, BASH_ENV=str(self.tools), TMPDIR=str(self.temp),
                   DB_NAME="fixture", DB_USER="fixture", DB_HOST="invalid", DB_PORT="5432",
                   DB_PASSWORD="synthetic-secret", DB_BACKUP_S3_BUCKET="fixture",
                   AWS_REGION="ap-northeast-2", FAIL=fail, FIXTURE_HOUR=hour)
        result = subprocess.run(["bash", SCRIPT, mode], cwd=self.work, env=env,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, timeout=5)
        self.assertNotIn(env["DB_PASSWORD"], result.stdout)
        self.assertEqual(list(self.temp.iterdir()), [])
        return result

    def test_daily_repeated_runs_upload_once(self):
        first = self.backup()
        self.assertEqual(first.returncode, 0, first.stdout)
        self.assertIn("bytes=7", first.stdout)
        self.assertEqual(self.backup().returncode, 0)
        self.assertEqual((self.work / "calls").read_text().splitlines(), ["dump", "uploaded"])

    def test_failed_list_never_starts_a_dump_and_failed_dump_never_uploads(self):
        self.assertNotEqual(self.backup(fail="list").returncode, 0)
        self.assertFalse((self.work / "calls").exists())
        self.assertEqual((self.work / "waits").read_text().splitlines(), ["600", "1800"])
        self.assertNotEqual(self.backup(fail="dump").returncode, 0)
        self.assertEqual((self.work / "calls").read_text().splitlines(), ["dump"] * 3)
        self.assertFalse((self.work / "object").exists())

    def test_interrupted_upload_can_be_recovered_by_catch_up(self):
        self.assertEqual(self.backup("catch-up", hour="02").returncode, 0)
        self.assertFalse((self.work / "calls").exists())
        result = self.backup("catch-up", fail="interrupt")
        self.assertEqual(result.returncode, 143, result.stdout)
        self.assertFalse((self.work / "object").exists())
        self.assertEqual(self.backup("catch-up").returncode, 0)
        self.assertEqual((self.work / "calls").read_text().splitlines(), ["dump", "dump", "uploaded"])
