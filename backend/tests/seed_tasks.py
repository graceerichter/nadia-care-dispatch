import requests
import time

# Target endpoint
URL = "http://localhost:8000/api/webhooks/intake"

# Curated task payloads for a high-impact demo
tasks = [
    {"source": "spruce_health", "text": "I'm 38 weeks pregnant in Houston, Texas, and I'm feeling severe abdominal pain and heavy bleeding."},
    {"source": "athena_ehr", "text": "Patient is in their 2nd trimester, living in Atlanta, GA. Requesting urgent assistance with utility shut-off notice."},
    {"source": "hubspot_crm", "text": "Inbound request for transportation support in Miami, Florida for postpartum check-up. Medicaid coverage."},
    {"source": "spruce_health", "text": "Feeling very overwhelmed, crying constantly. Postpartum and struggling to care for the baby. Need help."},
    {"source": "athena_ehr", "text": "Requesting WIC and formula vouchers in Austin, Texas. 3rd trimester mother, very low income."},
    {"source": "hubspot_crm", "text": "Routine check-in: Looking for local doula recommendations in Savannah, GA. Commercial insurance."},
    {"source": "spruce_health", "text": "I need a ride to my doctor in Jacksonville, Florida next Tuesday. I'm 12 weeks pregnant."},
]

def seed():
    print(f"🚀 Deploying {len(tasks)} tasks to dispatch engine...")
    for i, task in enumerate(tasks):
        try:
            response = requests.post(URL, json=task)
            if response.status_code == 200:
                print(f"✅ Dispatched task {i+1}: {task['text'][:50]}...")
            else:
                print(f"❌ Failed task {i+1}: {response.status_code}")
        except Exception as e:
            print(f"⚠️ Connection error: {e}")
            break
        time.sleep(0.5) # Slight delay for smooth visual intake
    print("✨ Seeding complete. Dashboard is populated!")

if __name__ == "__main__":
    seed()