import logging
import os
import subprocess
import sys
import time

logger = logging.getLogger(__name__)


def run_watchdog():
    current_dir = os.path.dirname(os.path.abspath(__file__))

    # Proje kök dizinindeki logs klasörünü hedefle
    project_root = os.path.dirname(os.path.dirname(current_dir))
    log_dir = os.path.join(project_root, "logs")
    os.makedirs(log_dir, exist_ok=True)
    error_log_path = os.path.join(log_dir, "video_analitik_error.log")

    restart_count = 0
    while True:
        try:
            with open(error_log_path, "a", encoding="utf-8") as err_file:
                cmd = [sys.executable, "-m", "video_analytics.main"] + sys.argv[1:]
                process = subprocess.Popen(
                    cmd,
                    stdout=sys.stdout,
                    stderr=subprocess.PIPE,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                )

                if process.stderr is None:
                    raise RuntimeError("Watchdog stderr pipe could not be created")
                for line in process.stderr:
                    sys.stderr.write(line)
                    sys.stderr.flush()
                    err_file.write(line)
                    err_file.flush()

                process.wait()
                if process.returncode == 0:
                    break
        except KeyboardInterrupt:
            break
        except Exception:
            logger.exception("Watchdog process failed")

        time.sleep(5)
        restart_count += 1


if __name__ == "__main__":
    run_watchdog()
