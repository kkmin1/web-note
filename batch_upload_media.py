import os
import subprocess
import time

GIT_PATH = r"C:\Program Files\Git\bin\git.exe"
MEDIA_DIR = "media"
BATCH_SIZE = 30  # Smaller batch size for stability
DELAY_BETWEEN_BATCHES = 5 # Seconds to wait between pushes

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

    # Get files that are NOT yet committed in the media directory
    # Using 'git ls-files --others --modified media' to find untracked/modified files
    output = run_git(["ls-files", "--others", "--modified", MEDIA_DIR])
    if output is None:
        return
    
    files = [f.strip() for f in output.splitlines() if f.strip().startswith(MEDIA_DIR)]
    
    total_files = len(files)
    if total_files == 0:
        print("No new or modified media files to upload.")
        return

    print(f"Found {total_files} files to upload.")

    for i in range(0, total_files, BATCH_SIZE):
        batch = files[i:i + BATCH_SIZE]
        batch_num = i//BATCH_SIZE + 1
        total_batches = (total_files + BATCH_SIZE - 1) // BATCH_SIZE
        
        print(f"[{batch_num}/{total_batches}] Processing {len(batch)} files...")
        
        # Add files in this batch
        run_git(["add"] + batch)
        
        # Commit this batch
        run_git(["commit", "-m", f"Upload media batch {batch_num}"])
        
        # Push with retry logic
        success = False
        for attempt in range(3):
            print(f"  Pushing (attempt {attempt + 1})...")
            if run_git(["push", "origin", "main"]) is not None:
                success = True
                break
            print("  Push failed, waiting before retry...")
            time.sleep(10)
        
        if not success:
            print(f"CRITICAL: Failed to push batch {batch_num} after 3 attempts. Stopping.")
            break
            
        print(f"  Batch {batch_num} uploaded. Waiting {DELAY_BETWEEN_BATCHES}s before next batch...")
        time.sleep(DELAY_BETWEEN_BATCHES)

    print("Upload process finished.")

if __name__ == "__main__":
    main()
