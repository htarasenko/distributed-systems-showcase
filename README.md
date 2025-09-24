# distributed-systems-showcase
A proof-of-concept inspired by a job description

## Tech Stack
- Node.js
- PostgreSQL
- ClickHouse
- Kafka
- Nginx
- K6

*After creating the project and connecting the services in the most basic way, I did some performance analysis and optimization.
I'm not quite satisfied with the results, but the reason the project was created is fulfilled.*



# Performance Analysis Report
## Distributed Systems Showcase - Optimization Impact Analysis

**Test Configuration**: 20 Virtual Users, 60 seconds duration (k6 init script) 
```bash
docker compose --profile testing run --rm k6 run --stage 60s:20  /scripts/script.js
```


---

## 🔍 **Detailed Performance Analysis**

### **Phase 1: Database Connection Pool Tuning (Baseline)**
**Changes Applied**:
- Max connections: 20 → 50
- Min connections: 5 → 10
- Idle timeout: 30s → 60s
- Connection timeout: 2s → 5s

**Results**:
- **Bets Processed**: 1,419 bets
- **Throughput**: 23.47 bets/second
- **HTTP P95**: 74.66ms
- **Success Rate**: 99.44%
- **VU Utilization**: 19/20 (95% utilization)

**Impact**: ⭐ **BASELINE** - Initial optimized configuration

### **Phase 2: Database Indexes**
**Changes Applied**:
- Added composite index: `idx_bets_user_id_created_at`
- Added composite index: `idx_wallet_transactions_user_id_created_at`

**Results**:
- **Bets Processed**: 1,468 bets (+3.5% improvement)
- **Throughput**: 24.27 bets/second (+3.5% improvement)
- **HTTP P95**: 73.73ms (-1.2% improvement)
- **Success Rate**: 99.64% (+0.2% improvement)
- **VU Utilization**: 19/20 (95% utilization)

**Impact**: **LOW** 

### **Phase 3: Horizontal Scaling (3 App Instances)**
**Changes Applied**:
- Scaled app service to 3 replicas
- Added Nginx load balancer with upstream configuration
- Implemented least_conn load balancing algorithm
- Added performance optimizations (gzip, keepalive, etc.)

**Results**:
- **Bets Processed**: 1,551 bets (+9.3% improvement)
- **Throughput**: 25.6 bets/second (+9.1% improvement)
- **HTTP P95**: 60.6ms (-18.8% improvement)
- **Success Rate**: 99.81% (+0.4% improvement)
- **VU Utilization**: 19/20 (95% utilization)

**Impact**: ⭐⭐ **LOW** - Minimal improvement due to database bottleneck

### **Phase 4: PostgreSQL Performance Optimization**
**Changes Applied**:
- Increased max_connections: 100 → 200
- Optimized shared_buffers: 128MB → 256MB
- Enhanced effective_cache_size: 4GB → 1GB
- Improved maintenance_work_mem: 64MB
- Optimized checkpoint_completion_target: 0.9
- Enhanced wal_buffers: 16MB
- Improved work_mem: 4MB
- Optimized random_page_cost: 1.1
- Enhanced effective_io_concurrency: 200

**Results**:
- **Bets Processed**: 1,659 bets (+16.9% improvement)
- **Bets/Second**: 27.13 bets/second (+15.6% improvement)
- **HTTP P95**: 35.58ms (-52% improvement)
- **HTTP P90**: 22.6ms (-70% improvement)
- **Average Response**: 12.05ms (-84% improvement)
- **Success Rate**: 100% (+0.6% improvement)
- **Total HTTP Requests**: 8,350 requests (includes health checks, analytics, metrics)
- **HTTP Throughput**: 136.57 requests/second (all endpoints)
- **VU Utilization**: 4/20 (20% utilization, max 19 VUs reached)

---

## 📈 **Performance Metrics Comparison**

| Metric | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Total Improvement |
|--------|---------|---------|---------|---------|-------------------|
| **Bets/Second** | 23.5 | 24.3 | 25.6 | 27.13 | **+15.6%** |
| **Total Bets** | 1,419 | 1,468 | 1,551 | 1,659 | **+16.9%** |
| **HTTP P95 (ms)** | 74.7 | 73.7 | 60.6 | 35.58 | **-52%** |
| **Success Rate (%)** | 99.44 | 99.64 | 99.81 | 100.0 | **+0.6%** |
| **VU Utilization** | 95% | 95% | 95% | 20% | **-79%** |
| **Error Rate (%)** | 0.56 | 0.36 | 0.19 | 0.0 | **-100%** |



