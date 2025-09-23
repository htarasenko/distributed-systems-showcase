# distributed-systems-showcase
A proof-of-concept inspired by a job description


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
- **LoadBalancer Service:** External access on localhost:9092