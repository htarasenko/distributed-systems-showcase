# distributed-systems-showcase
A proof-of-concept inspired by a job description

To prepare for your interview, your plan to build a POC (Proof of Concept) is excellent. It demonstrates a "PoC first" approach and a deep sense of ownership, which the job description explicitly mentions. Here are suggestions to make your POC more professional and a powerful talking point during your interview.

1. Refine the POC Architecture & Workflow
Your proposed workflow is a great starting point, but it can be more professional by adding a layer of application logic and a more realistic event flow.

Integrate gRPC: Instead of using gRPC or Kafka, you should use them together to show a comprehensive understanding. gRPC is a Remote Procedure Call framework for direct, high-performance, synchronous communication between services. Kafka, on the other hand, is a distributed streaming platform for asynchronous, high-throughput messaging. Your POC should use both. A great way to demonstrate this is to use gRPC for a direct, low-latency transaction and Kafka for high-volume, fire-and-forget events.

Proposed Professional Workflow:

K6 generates events: K6 doesn't just "create" events, it simulates users or systems. Let's say K6 simulates a user action like a "bet" in a gaming context.

Node.js service receives the event: A Node.js service (acting as a microservice) receives the event from K6. This is where your code shines.

Synchronous Transaction (gRPC): This Node.js service makes a gRPC call to a second microservice (e.g., a "wallet" service) to perform a critical, low-latency operation, like checking and deducting a user's balance. This highlights your understanding of when to use synchronous communication for mission-critical tasks where you need an immediate response.

Asynchronous Event (Kafka): After the gRPC call is successful, the first Node.js service publishes a new event (e.g., "bet placed") to a Kafka topic. This event is a fire-and-forget message, showing that the system is decoupled.

Kafka Consumers: Have at least two separate Node.js workers consuming the event from Kafka.

Transaction & Logging:

Worker 1 (PostgreSQL): This worker processes the Kafka event and records the transaction in the PostgreSQL database. This demonstrates handling of relational data and ACID properties.

Worker 2 (ClickHouse): This worker also processes the same Kafka event but writes the event data to ClickHouse. This is crucial for showing your understanding of how to use a columnar database for high-volume, real-time analytics and logging, which is a perfect fit for a gaming company that needs to process billions of transactions per day. This shows you understand the different use cases for each database.

2. Implementation Best Practices
The execution of your POC is what will make it stand out.

Kubernetes Configuration: Use Helm charts or a well-organized set of Kubernetes YAML files to define your deployments, services, and stateful sets for Kafka, PostgreSQL, and ClickHouse. This shows you're not just running commands but can manage complex infrastructure professionally.

Observability: Grafana is a great choice, but you should also implement Prometheus to scrape metrics from your Node.js workers and other services. Grafana is for visualization, but Prometheus is for the collection and storage of metrics.

K6 Scripting: Your K6 script should not just emit events; it should define scenarios and thresholds. For example, "99% of requests should have a latency below 100ms." This shows a proactive approach to performance optimization.

Documentation: Create a README.md file for your POC. This is arguably the most important part.

Architecture Diagram: A simple diagram showing the flow you've designed.

Problem & Solution: Briefly explain the problem you're solving (emulating a high-volume, low-latency system) and how your solution addresses it.

Setup Instructions: Provide clear steps to get the system running locally.

Interview Talking Points: Write down the key takeaways and performance metrics you observed. For example: "The gRPC transaction latency was consistently under 5ms, while the Kafka-to-ClickHouse ingestion maintained throughput of thousands of events per second."

3. Interview-Specific Talking Points
During the interview, don't just say you built a POC. Tell a story about it.

Focus on the "Why": Explain why you chose each component. "I chose Kafka for asynchronous event ingestion because it decouples the system and allows for high throughput, which is essential for a gaming platform with billions of transactions. I used gRPC for the critical wallet transaction because its low latency is crucial for a smooth user experience where 'milliseconds matter.'"

Demonstrate Problem-Solving: Talk about a challenge you faced, for example, "Initially, I had trouble with data consistency between PostgreSQL and ClickHouse, but I used Kafka's event-based architecture to ensure both systems were eventually consistent, while PostgreSQL handled the immediate, atomic transaction."

Highlight the Metrics: Use the data from Grafana and K6. "As you can see from this Grafana dashboard, the system can handle thousands of events per second with a p99 latency of Xms for the gRPC call." This shifts the conversation from theory to a tangible, demonstrable result.

Link it to the Job: Directly connect your POC to the job description. Mention how your work with Kubernetes, Kafka, gRPC, and the databases directly relates to their needs for "lowest possible latency" and "most efficient resource usage" in a "high-end micro-service-based platform."

## Quick Start

### Prerequisites
- Docker Desktop with Kubernetes enabled
- Helm 3.x
- kubectl

### Kafka Installation

1. **Switch to Docker Desktop Kubernetes context:**
   ```bash
   kubectl config use-context docker-desktop
   ```

2. **Add Bitnami Helm repository:**
   ```bash
   helm repo add bitnami https://charts.bitnami.com/bitnami
   helm repo update
   ```

3. **Install Kafka with custom configuration:**
   ```bash
   helm install kafka bitnami/kafka -f kafka-values.yaml
   ```

4. **Verify installation:**
   ```bash
   kubectl get pods -l app.kubernetes.io/name=kafka
   kubectl get services -l app.kubernetes.io/name=kafka
   ```

### Kafka Usage

**Connection Details:**
- **Bootstrap Server:** `localhost:9092` (external access)
- **Internal Cluster:** `kafka.default.svc.cluster.local:9092`
- **Authentication:** SASL_PLAINTEXT with SCRAM-SHA-256

**Client Configuration:**
Create a `client.properties` file:
```properties
security.protocol=SASL_PLAINTEXT
sasl.mechanism=SCRAM-SHA-256
sasl.jaas.config=org.apache.kafka.common.security.scram.ScramLoginModule required \
    username="user1" \
    password="$(kubectl get secret kafka-user-passwords --namespace default -o jsonpath='{.data.client-passwords}' | base64 -d | cut -d , -f 1)";
```

**Test Kafka:**
```bash
# Create a test topic
kubectl run kafka-client --restart='Never' --image docker.io/bitnami/kafka:4.0.0-debian-12-r10 --namespace default --command -- sleep infinity
kubectl cp client.properties kafka-client:/tmp/client.properties
kubectl exec kafka-client -- kafka-topics.sh --create --topic test-topic --bootstrap-server kafka.default.svc.cluster.local:9092 --partitions 3 --replication-factor 1 --command-config /tmp/client.properties

# Send a message
echo "Hello Kafka!" | kubectl exec -i kafka-client -- kafka-console-producer.sh --producer.config /tmp/client.properties --bootstrap-server kafka.default.svc.cluster.local:9092 --topic test-topic

# Consume messages
kubectl exec kafka-client -- kafka-console-consumer.sh --consumer.config /tmp/client.properties --bootstrap-server kafka.default.svc.cluster.local:9092 --topic test-topic --from-beginning --timeout-ms 10000

# Cleanup
kubectl delete pod kafka-client
```

### Architecture Components

- **Kafka:** Message streaming platform for asynchronous communication
- **Kubernetes:** Container orchestration with Helm for deployment management
- **SASL Authentication:** Secure client connections with SCRAM-SHA-256
- **LoadBalancer Service:** External access on localhost:9092