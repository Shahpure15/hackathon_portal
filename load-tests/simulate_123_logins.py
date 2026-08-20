import sys
import os
import time
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
import json

# Add backend directory to sys.path to access models
backend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'backend')
sys.path.insert(0, backend_dir)

from app.database import SessionLocal
from app.models import Team, User, Role
from app.routers.admin import generate_team_leader_password

# Target API URL (Defaults to local backend, or set TARGET_URL=https://mitinida-backendportal-1509.onrender.com)
TARGET_BASE_URL = os.getenv("TARGET_URL", "https://mitinida-backendportal-1509.onrender.com")
LOGIN_ENDPOINT = f"{TARGET_BASE_URL.rstrip('/')}/auth/login"

def load_credentials_from_db():
    db = SessionLocal()
    credentials = []
    try:
        teams = db.query(Team).all()
        for t in teams:
            username = t.registrationId.lower()
            password = generate_team_leader_password(t.leaderPhone, t.registrationId)
            credentials.append({
                "username": username,
                "password": password,
                "team_name": t.name
            })
    finally:
        db.close()
    return credentials

def attempt_login(cred):
    username = cred["username"]
    password = cred["password"]
    start_time = time.time()
    
    try:
        resp = requests.post(
            LOGIN_ENDPOINT,
            json={"username": username, "password": password},
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        latency_ms = (time.time() - start_time) * 1000
        
        if resp.status_code == 200:
            data = resp.json()
            token = data.get("access_token")
            role = data.get("role")
            return {
                "username": username,
                "success": True,
                "status_code": 200,
                "latency_ms": round(latency_ms, 2),
                "role": role,
                "error": None
            }
        else:
            return {
                "username": username,
                "success": False,
                "status_code": resp.status_code,
                "latency_ms": round(latency_ms, 2),
                "role": None,
                "error": f"HTTP {resp.status_code}: {resp.text[:100]}"
            }
    except Exception as e:
        latency_ms = (time.time() - start_time) * 1000
        return {
            "username": username,
            "success": False,
            "status_code": 0,
            "latency_ms": round(latency_ms, 2),
            "role": None,
            "error": str(e)
        }

def run_simulation(max_workers=20):
    print("=" * 60)
    print("123 CONCURRENT USERS LOGIN SIMULATION")
    print(f"Target Server: {TARGET_BASE_URL}")
    print(f"Max Worker Threads: {max_workers}")
    print("=" * 60)
    
    print("\nFetching credentials for all team leaders from DB...")
    creds = load_credentials_from_db()
    total_users = len(creds)
    print(f"Found {total_users} team leader accounts ready for load test.")
    
    if total_users == 0:
        print("[ERROR] No team leader accounts found in database!")
        return

    print(f"\nLaunching {total_users} simultaneous login requests...\n")
    start_sim_time = time.time()
    results = []

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(attempt_login, cred): cred for cred in creds}
        for future in as_completed(futures):
            res = future.result()
            results.append(res)
            status_symbol = "[OK]" if res["success"] else "[FAIL]"
            print(f"{status_symbol} User: {res['username']:<15} | Status: {res['status_code']:<3} | Time: {res['latency_ms']:>6.1f}ms | Error: {res['error'] or 'None'}")

    total_sim_time = time.time() - start_sim_time
    successful_logins = [r for r in results if r["success"]]
    failed_logins = [r for r in results if not r["success"]]
    latencies = [r["latency_ms"] for r in results if r["success"]]

    avg_latency = sum(latencies) / len(latencies) if latencies else 0
    max_latency = max(latencies) if latencies else 0
    min_latency = min(latencies) if latencies else 0
    
    rps = total_users / total_sim_time if total_sim_time > 0 else 0

    print("\n" + "=" * 60)
    print("SIMULATION SUMMARY REPORT")
    print("=" * 60)
    print(f"Total Logins Attempted : {total_users}")
    print(f"Successful Logins (200) : {len(successful_logins)} ({len(successful_logins)/total_users*100:.1f}%)")
    print(f"Failed Logins          : {len(failed_logins)}")
    print(f"Total Wall Clock Time  : {total_sim_time:.2f} seconds")
    print(f"Throughput (RPS)       : {rps:.2f} req/sec")
    print(f"Min Latency            : {min_latency:.1f} ms")
    print(f"Average Latency        : {avg_latency:.1f} ms")
    print(f"Max Latency            : {max_latency:.1f} ms")
    print("=" * 60)

if __name__ == "__main__":
    workers = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    run_simulation(max_workers=workers)
