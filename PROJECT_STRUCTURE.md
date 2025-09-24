# Project Structure

This document describes the recommended repository structure for the distributed systems showcase project.

## Directory Structure

```
├── .gitignore                          # Git ignore rules
├── README.md                           # Main project documentation
├── docker-compose.yml                  # Local development environment
│
├── /src                                # Source code
│   ├── /app                            # Node.js microservice
│   │   ├── app.js                      # Main application file
│   │   ├── package.json                # Node.js dependencies
│   │   ├── Dockerfile                  # Container image definition
│   │
│   └── /k6                             # Load testing
│       ├── script.js                   # K6 load test script
│       └── Dockerfile                  # K6 container image
│
├── /k8s                                # Kubernetes manifests
│   ├── /generated                      # Auto-generated manifests
│   │   ├── app-deployment.yaml         # Basic deployment
│   │   ├── app-service.yaml            # Basic service
│   │   └── postgres-deployment.yaml    # Basic PostgreSQL
│   │
│   ├── /refined                        # Production-ready manifests
│   │   ├── app-deployment.yaml         # Enhanced deployment
│   │   ├── app-service.yaml            # Enhanced service
│   │   ├── k6-job.yaml                 # Load testing job
│   │   └── all-resources.yaml          # Complete deployment
│   │
│   └── /helm                           # Helm chart
│       ├── Chart.yaml                  # Chart metadata
│       ├── values.yaml                 # Default values
│       └── /templates                  # Kubernetes templates
│           ├── deployment.yaml         # App deployment template
│           ├── service.yaml            # Service template
│           ├── configmap.yaml          # ConfigMap template
│           ├── serviceaccount.yaml     # ServiceAccount template
│           ├── k6-job.yaml             # K6 job template
│           └── _helpers.tpl            # Template helpers
│
├── /monitoring                         # Observability configuration
│   ├── prometheus.yml                  # Prometheus configuration
│   └── /grafana                        # Grafana dashboards
│       ├── /dashboards                 # Dashboard definitions
│       └── /datasources                # Data source configurations
│
└── /init-scripts                       # Database initialization
    ├── 01-init-postgres.sql            # PostgreSQL setup
    └── 02-init-clickhouse.sql          # ClickHouse setup
```

## File Descriptions

### Source Code (`/src`)

#### Application (`/src/app`)
- **`app.js`**: Main Node.js microservice implementing the distributed systems workflow
- **`package.json`**: Node.js dependencies and scripts
- **`Dockerfile`**: Multi-stage container build for production

#### Load Testing (`/src/k6`)
- **`script.js`**: K6 load testing script with custom metrics
- **`Dockerfile`**: K6 container for running load tests

### Kubernetes Manifests (`/k8s`)

#### Generated (`/k8s/generated`)
Basic Kubernetes manifests generated using `kubectl` commands. These are starting points that get refined for production use.

#### Refined (`/k8s/refined`)
Production-ready Kubernetes manifests with:
- Security contexts and policies
- Resource limits and requests
- Health checks and probes
- Monitoring annotations
- Proper namespacing

#### Helm Chart (`/k8s/helm`)
Complete Helm chart for deploying the entire stack:
- **`Chart.yaml`**: Chart metadata and dependencies
- **`values.yaml`**: Configurable values for different environments
- **`/templates`**: Kubernetes resource templates with Helm templating

### Monitoring (`/monitoring`)

#### Prometheus (`prometheus.yml`)
- Service discovery configuration
- Scrape intervals and timeouts
- Alerting rules

#### Grafana (`/grafana`)
- Dashboard provisioning
- Data source configurations
- Pre-built dashboards for the application

### Database Initialization (`/init-scripts`)

#### PostgreSQL (`01-init-postgres.sql`)
- Table creation with proper indexes
- Sample data insertion
- Triggers for audit trails

#### ClickHouse (`02-init-clickhouse.sql`)
- Analytics-optimized table structure
- Materialized views for aggregations
- Sample data for testing

## Development Workflow

### 1. Local Development
```bash
# Start all services locally
docker-compose up -d

# Run the application
cd src/app
npm install
npm run dev

# Run load tests
cd src/k6
docker build -t k6-test .
docker run --rm -v $(pwd):/scripts k6-test
```

### 2. Kubernetes Deployment

#### Using Generated Manifests
```bash
# Deploy basic version
kubectl apply -f k8s/generated/

# Check status
kubectl get pods,services
```

#### Using Refined Manifests
```bash
# Deploy production-ready version
kubectl apply -f k8s/refined/all-resources.yaml

# Check status
kubectl get all -n distributed-systems
```

#### Using Helm
```bash
# Install dependencies
helm dependency update k8s/helm/

# Deploy with Helm
helm install distributed-systems k8s/helm/ -f k8s/helm/values.yaml

# Upgrade deployment
helm upgrade distributed-systems k8s/helm/ -f k8s/helm/values.yaml
```

### 3. Monitoring
```bash
# Access Grafana
open http://localhost:3001

# Access Prometheus
open http://localhost:9090

# View application metrics
curl http://localhost:3000/metrics
```

## Architecture Components

### Microservices
- **Node.js App**: Main application handling HTTP requests
- **Kafka**: High-throughput message streaming
- **PostgreSQL**: ACID-compliant transaction storage
- **ClickHouse**: High-performance analytics storage

### Observability
- **Prometheus**: Metrics collection and storage
- **Grafana**: Metrics visualization and dashboards
- **K6**: Load testing and performance validation

### Infrastructure
- **Docker**: Containerization
- **Kubernetes**: Container orchestration
- **Helm**: Package management for Kubernetes

## Best Practices

### Security
- Non-root containers
- Read-only root filesystems
- Security contexts and policies
- Secret management

### Performance
- Resource limits and requests
- Health checks and probes
- Horizontal pod autoscaling
- Connection pooling

### Monitoring
- Custom metrics for business logic
- Structured logging
- Distributed tracing
- Alerting rules

### Development
- Environment-specific configurations
- Git hooks for validation
- Automated testing
- CI/CD pipelines

## Environment Variables

### Application
- `NODE_ENV`: Environment (development/production)
- `PORT`: Application port
- `DATABASE_URL`: PostgreSQL connection string
- `CLICKHOUSE_URL`: ClickHouse connection string
- `KAFKA_BROKERS`: Kafka broker addresses

### Kubernetes
- Namespace: `distributed-systems`
- Service Account: `distributed-systems-app`
- ConfigMap: `distributed-systems-config`
- Secret: `distributed-systems-secrets`

This structure provides a solid foundation for building, deploying, and maintaining a distributed systems showcase that demonstrates modern microservices architecture patterns.
