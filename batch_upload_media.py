import os
import subprocess
import time

GIT_PATH = r"C:\Program Files\Git\bin\git.exe"
MEDIA_DIR = "media"
BATCH_SIZE = 100

def run_git(args):
    try:
        cmd = [GIT_PATH] + args
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return result.stdout
    except subprocess.CalledProcessError as e:
        print(f"Error running git {' '.join(args)}: {e.stderr}")
        return None

def main():
    if not os.path.exists(MEDIA_DIR):
        print("Media directory not found.")
        return

    # Get all untracked or modified files in media/
    files = []
    for f in os.listdir(MEDIA_DIR):
        fpath = os.path.join(MEDIA_DIR, f)
        if os.path.isfile(fpath):
            files.append(fpath)

    total_files = len(files)
    print(f"Found {total_files} files in {MEDIA_DIR}.")

    for i in range(0, total_files, BATCH_SIZE):
        batch = files[i:i + BATCH_SIZE]
        print(f"Processing batch {i//BATCH_SIZE + 1} ({i} to {min(i+BATCH_SIZE, total_files)})...")
        
        # Add files
        run_git(["add"] + batch)
        
        # Commit
        run_git(["commit", "-m", f"Upload media batch {i//BATCH_SIZE + 1}"])
        
        # Push
        print("Pushing to remote...")
        success = run_git(["push", "origin", "main"])
        
        if success:
            print(f"Batch {i//BATCH_SIZE + 1} uploaded successfully.")
        else:
            print(f"Batch {i//BATCH_SIZE + 1} push failed. Waiting 10s and retrying once...")
            time.sleep(10)
            if run_git(["push", "origin", "main"]):
                print("Retry successful.")
            else:
                print("Retry failed. Stopping to avoid issues.")
                break

if __name__ == "__main__":
    main()
