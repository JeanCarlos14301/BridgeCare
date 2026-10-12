import os
import shutil
import subprocess
import sys


def version(command: list[str]) -> bool:
    executable = shutil.which(command[0])
    if executable is None:
        print(f"MISSING  {command[0]}")
        return False
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    output = (result.stdout or result.stderr).strip().splitlines()[0]
    print(f"OK       {command[0]}: {output}")
    return result.returncode == 0


def main() -> int:
    npm_command = "npm.cmd" if os.name == "nt" else "npm"
    checks = [
        [sys.executable, "--version"],
        ["uv", "--version"],
        ["node", "--version"],
        [npm_command, "--version"],
        ["docker", "--version"],
        ["docker", "compose", "version"],
    ]
    results = [version(command) for command in checks]
    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
