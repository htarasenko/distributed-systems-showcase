
## �� **How to Run the Distributed Systems Showcase Project**

### **✅ Option 1: Local Development with Docker Compose (Currently Running!)**

**What's Running:**
- **Node.js App**: http://localhost:3000
- **PostgreSQL**: localhost:5432
- **ClickHouse**: localhost:8123
- **Kafka**: localhost:9092
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001

**Commands:**
```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f app

# Stop all services
docker compose down

# Rebuild and restart
docker compose up --build -d
```
