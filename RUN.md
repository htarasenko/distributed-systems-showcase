
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

### **Option 2: Run Individual Components**

**Just the Node.js App:**
```bash
cd src/app
npm install
npm start
```

**Just K6 Load Testing:**
```bash
cd src/k6
docker build -t k6-test .
docker run --rm -v $(pwd):/scripts k6-test
```

### **Option 3: Kubernetes Deployment**

**Using Generated Manifests:**
```bash
kubectl apply -f k8s/generated/
```

**Using Refined Manifests:**
```bash
kubectl apply -f k8s/refined/all-resources.yaml
```

**Using Helm:**
```bash
helm install distributed-systems k8s/helm/ -f k8s/helm/values.yaml
```

## �� **Testing the Application**

### **1. Health Check**
```bash
curl http://localhost:3000/health
```

### **2. Place a Bet (Main Workflow)**
```bash
curl -X POST http://localhost:3000/api/bet \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "550e8400-e29b-41d4-a716-446655440001",
    "amount": 25.50,
    "gameId": "game-1",
    "betType": "single"
  }'
```

### **3. Get Bet History**
```bash
curl http://localhost:3000/api/bets/550e8400-e29b-41d4-a716-446655440001
```

### **4. Get Analytics**
```bash
curl "http://localhost:3000/api/analytics/bets?groupBy=hour"
```

### **5. View Metrics**
```bash
curl http://localhost:3000/metrics
```

## 📊 **Monitoring Dashboards**

- **Grafana**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090

## �� **Development Workflow**

### **Make Changes to the App:**
1. Edit files in `src/app/`
2. Rebuild: `docker compose up --build -d app`
3. View logs: `docker compose logs -f app`

### **Run Load Tests:**
```bash
# Run K6 tests
docker compose run --rm k6

# Or run locally
cd src/k6
docker build -t k6-test .
docker run --rm -v $(pwd):/scripts k6-test
```

### **Database Access:**
```bash
# PostgreSQL
docker compose exec postgres psql -U postgres -d distributed_systems

# ClickHouse
docker compose exec clickhouse clickhouse-client
```

## 🎯 **What's Working Right Now**

✅ **All services are running and healthy**  
✅ **Node.js app with Kafka, PostgreSQL, ClickHouse integration**  
✅ **Health checks and metrics endpoints**  
✅ **Monitoring with Prometheus and Grafana**  
✅ **Database initialization scripts**  
✅ **Load testing with K6**  

The project is now fully operational! You can start testing the distributed systems workflow by placing bets through the API endpoints.