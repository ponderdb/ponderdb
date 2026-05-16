# Database & Storage Layer — Deep Research

## For TB-Scale Universal AI Memory Server

*Research compiled May 2025. Verify pricing before production decisions.*

---

## Table of Contents

1. [PostgreSQL + pgvector](#1-postgresql--pgvector)
2. [Qdrant](#2-qdrant)
3. [Milvus](#3-milvus)
4. [ChromaDB](#4-chromadb)
5. [Weaviate](#5-weaviate)
6. [SQLite + sqlite-vec](#6-sqlite--sqlite-vec)
7. [Redis + RediSearch](#7-redis--redisearch)
8. [Embedding Models](#8-embedding-models)
9. [Comparative Summary](#9-comparative-summary)
10. [Recommended Architecture](#10-recommended-architecture)

---

## 1. PostgreSQL + pgvector

### Overview

pgvector is a PostgreSQL extension adding vector similarity search. Default choice for teams already on Postgres.

### Latest Version & Key Features

- **Version:** 0.7.x (mid-2025); 0.6.0 introduced parallel HNSW index builds; 0.7.x improved quantization (binary, scalar)
- **Index types:** IVFFlat (approximate) and HNSW (approximate, faster queries)
- **Distance metrics:** L2, cosine, inner product, L1, Hamming, Jaccard

### HNSW Performance Benchmarks

| Dataset | Vectors | Dimensions | QPS (single node) | Recall@10 | Notes |
|---------|---------|------------|-------------------|-----------|-------|
| ANN Benchmarks (sift-128) | 1M | 128 | ~1,000-3,000 | 0.97-0.99 | m=16, ef_construction=64 |
| OpenAI ada-002 embeddings | 1M | 1536 | ~400-900 | 0.95-0.98 | memory-heavy |
| Large scale (10M) | 10M | 768 | ~150-400 | 0.93-0.97 | requires tuning |

- HNSW build time: ~5-15 min for 1M vectors (768-dim) on 8-core server
- Parallel index builds: up to `max_parallel_maintenance_workers` threads
- Query latency p50: ~2-10 ms; p99: ~20-80 ms at 1M scale

### Scale Limits

- **Practical limit:** ~50-100M vectors on single node with adequate RAM
- **Disk-based:** HNSW index must fit in RAM for best performance; disk-based ANN is slow
- **Max dimensions:** 2,000 (hard limit per vector in pgvector <= 0.6.x); raised to **16,000** in 0.7.x for halfvec type
- **TB scale:** Achievable with partitioning + Citus extension for sharding across nodes; pgvectorscale (Timescale) extends this significantly

### pgvectorscale (Timescale extension)

- DiskANN-based index — allows index to exceed RAM
- Claims 28x faster queries than pgvector at 99th percentile on 100M+ vectors
- Streaming disk reads rather than full in-memory index

### Pricing

| Tier | Cost |
|------|------|
| Self-hosted | Free (open source, Apache 2.0) |
| Neon (managed Postgres + pgvector) | Free tier: 512 MB storage; Pro: ~$19/mo+ |
| Supabase | Free tier; Pro $25/mo; scale pricing varies |
| Timescale Cloud | Free 30-day trial; ~$0.20-0.50/GB/mo |
| AWS RDS / Aurora | Standard RDS pricing + pgvector is free extension |

### Memory Footprint

- HNSW index RAM: ~m x dim x 4 bytes x N vectors (approximate)
  - 1M vectors, 1536-dim, m=16: ~100 GB index RAM (unquantized)
  - With binary quantization: ~8-16x reduction
- Base Postgres: ~256 MB minimum; 2-8 GB typical for production

### Installation

```bash
# Ubuntu/Debian
apt install postgresql-16-pgvector
# From source
git clone https://github.com/pgvector/pgvector && make && make install
# In psql:
CREATE EXTENSION vector;
```

- Requires PostgreSQL 12+; recommends 15+
- No GPU required; SIMD optimizations auto-detected (AVX-512, NEON)

### Limitations

- Single-node HNSW requires index in RAM for best performance
- No native distributed/cluster mode (needs Citus or partitioning)
- Filtering: pre-filter with WHERE clause degrades recall; post-filter wastes I/O
- No built-in vector compression by default (quantization added in 0.7.x)
- Concurrent writes slow HNSW builds

---

## 2. Qdrant

### Overview

Purpose-built vector database written in Rust. Known for high performance, on-disk indexing, and advanced filtering.

### Benchmarks

| Dataset | Vectors | Dims | QPS | Recall@1 | Latency p95 |
|---------|---------|------|-----|----------|-------------|
| laion-768 | 5M | 768 | ~600 | 0.99 | ~8 ms |
| dbpedia-openai | 1M | 1536 | ~850 | 0.99 | ~5 ms |
| gist-960 | 1M | 960 | ~1,200 | 0.98 | ~4 ms |
| deep-1B | 1B | 96 | ~2,000 | 0.95 | ~3 ms |

- **Filtered search QPS:** maintains ~80-90% of unfiltered QPS (key differentiator)
- **On-disk mode:** Mmap-based; handles datasets larger than RAM
- **Quantization:** Scalar (int8), binary, product quantization — up to 32x memory reduction

### Max Scale

- Single node: tested to **1B+ vectors** (with on-disk indexing)
- Distributed mode: horizontal sharding across nodes; effectively unlimited
- Cloud: clusters scale to multiple nodes automatically

### Pricing

| Tier | Cost |
|------|------|
| Self-hosted | Free, open source (Apache 2.0) |
| Qdrant Cloud Free | 1 cluster, 1 GB RAM, 0.5 vCPU — ~1M vectors (1536-dim quantized) |
| Qdrant Cloud Starter | ~$25/mo (2 GB RAM, 6 GB disk) |
| Qdrant Cloud Growth | ~$75-$300/mo depending on RAM/disk |
| Qdrant Cloud Enterprise | Custom pricing |
| Qdrant Hybrid Cloud | Self-hosted infra + Qdrant control plane |

### Memory Footprint

- Qdrant process: ~100-300 MB baseline
- Vectors: configurable between RAM and mmap (disk)
- Payload (metadata): stored on disk separately
- 1M vectors x 1536 dims (scalar quantized): ~4-5 GB
- 1M vectors x 1536 dims (binary quantized): ~500 MB-1 GB

### Installation

```bash
docker pull qdrant/qdrant
docker run -p 6333:6333 qdrant/qdrant
# Or binary:
cargo install qdrant  # requires Rust toolchain
```

- Python client: `pip install qdrant-client`
- No GPU required

### Limitations

- Distributed mode requires careful shard planning
- No SQL interface (REST + gRPC only)
- Limited JOIN / relational query support
- HNSW only (no IVFFlat option)

---

## 3. Milvus

### Overview

Cloud-native, distributed vector database. Designed for enterprise-scale (billions of vectors). CNCF graduated project.

### Benchmarks

| Dataset | Vectors | Dims | Index | QPS | Recall | Hardware |
|---------|---------|------|-------|-----|--------|----------|
| SIFT-1M | 1M | 128 | HNSW | ~3,000-5,000 | 0.98 | 8-core CPU |
| SIFT-1B | 1B | 128 | DiskANN | ~800-1,500 | 0.95 | 32-core, NVMe |
| OpenAI-1M | 1M | 1536 | HNSW | ~1,500-2,500 | 0.97 | 16-core CPU |
| Deep-100M | 100M | 96 | IVF_SQ8 | ~5,000-8,000 | 0.93 | 32-core CPU |

- GPU-accelerated indexing (NVIDIA RAFT integration in Milvus 2.4+)
- GPU index build for 1M vectors: ~30 seconds vs ~5 min on CPU

### Scale

- **Single standalone:** Up to ~100M vectors
- **Distributed (Milvus Cluster):** Billions of vectors; petabyte-scale storage with S3/MinIO
- **Architecture:** Separates compute (query/index nodes) from storage (etcd + MinIO/S3)

### Pricing

| Tier | Cost |
|------|------|
| Milvus Open Source | Free, Apache 2.0 |
| Zilliz Cloud Free | 2 CUs, 2GB storage |
| Zilliz Cloud Starter | ~$65/mo (1 CU) |
| Zilliz Cloud Standard | ~$130-$500/mo |
| Zilliz Cloud Enterprise | Custom |

### Installation

```bash
# Standalone (Docker Compose)
wget https://github.com/milvus-io/milvus/releases/download/v2.4.x/milvus-standalone-docker-compose.yml
docker compose up -d
# Kubernetes
helm repo add milvus https://zilliztech.github.io/milvus-helm/
helm install milvus milvus/milvus
```

- Dependencies: etcd, MinIO (or S3), Pulsar/Kafka
- GPU: Optional but recommended for 100M+ scale

### Limitations

- Heavy operational overhead (etcd, MinIO, message queues)
- Overkill for <10M vectors
- Complex cluster setup
- etcd can become bottleneck at high write throughput

---

## 4. ChromaDB

### Overview

Lightweight, developer-friendly vector database. Python-based. Best for prototyping.

### Benchmarks

| Dataset | Vectors | Dims | QPS | Recall | Notes |
|---------|---------|------|-----|--------|-------|
| ~100K | 100K | 384 | ~200-500 | 0.97 | embedded mode |
| ~1M | 1M | 768 | ~50-150 | 0.95 | client-server |
| ~5M | 5M | 768 | ~20-60 | 0.92 | noticeable degradation |

### Scale Limits

- **Practical sweet spot:** < 1M vectors
- No distributed mode, single process only
- Constrained by available RAM

### Pricing

| Tier | Cost |
|------|------|
| Self-hosted / embedded | Free, Apache 2.0 |
| Chroma Cloud | Beta / limited availability |

### Installation

```bash
pip install chromadb
# Embedded:
import chromadb; client = chromadb.Client()
# Server:
chroma run --path /data
```

### Limitations

- Not suitable for production TB-scale
- No distributed/sharded mode
- Python GIL limits concurrent search
- No GPU support

---

## 5. Weaviate

### Overview

Open-source vector database with built-in ML model integrations, GraphQL API, multi-modal support. Written in Go.

### Benchmarks

| Dataset | Vectors | Dims | QPS | Recall@10 | Latency p99 |
|---------|---------|------|-----|-----------|-------------|
| SIFT-1M | 1M | 128 | ~1,500-3,000 | 0.98 | ~10 ms |
| ANN dbpedia | 1M | 1536 | ~600-1,200 | 0.97 | ~15 ms |
| Large scale | 10M | 768 | ~200-500 | 0.95 | ~25 ms |

- **Multi-tenancy:** First-class support — key for SaaS memory servers
- **Compression:** Product Quantization (PQ) and Binary Quantization (BQ)

### Pricing

| Tier | Cost |
|------|------|
| Self-hosted | Free, BSD 3-Clause |
| WCS Sandbox | Free; 14-day TTL |
| WCS Starter | ~$25/mo (1 node, 4 GB RAM) |
| WCS Standard | ~$145-$580/mo |
| WCS Enterprise | Custom |

### Installation

```bash
docker pull semitechnologies/weaviate
docker run -p 8080:8080 semitechnologies/weaviate
```

### Limitations

- Complex configuration
- HNSW build is memory-intensive
- GraphQL API has learning curve

---

## 6. SQLite + sqlite-vec

### Overview

sqlite-vec (by Alex Garcia) — SQLite extension adding vector search. Ideal for embedded, offline, local-first deployments. Ultra-lightweight.

### Performance

| Dataset | Vectors | Dims | QPS | Notes |
|---------|---------|------|-----|-------|
| 100K | 100K | 384 | ~500-2,000 | exact (brute-force) |
| 1M | 1M | 384 | ~50-200 | single-threaded |
| 1M | 1M | 768 | ~20-80 | single-threaded |

- **Index type:** Brute-force exact KNN only (no ANN indexing yet)
- **Best for:** < 100K vectors for interactive latency

### Scale Limits

- Practical: ~1-5M vectors for sub-second exact search
- No distributed mode; single-file, single-writer

### Pricing

- **Free** — public domain / MIT
- No cloud offering

### Memory Footprint

- SQLite process: ~1-10 MB
- sqlite-vec extension: ~500 KB shared library
- Works on Linux, macOS, Windows, iOS, Android, WASM

### Installation

```bash
pip install sqlite-vec
# Or load extension in Python:
import sqlite3, sqlite_vec
conn = sqlite3.connect(":memory:")
sqlite_vec.load(conn)
```

- Works fully offline, no network, no daemon

### Limitations

- No ANN index (brute-force only)
- Single writer at a time
- Not suitable for > 5M vectors at interactive latency

---

## 7. Redis + RediSearch (Redis Stack)

### Overview

Redis Stack bundles vector search with RedisJSON. Ultra-fast in-memory caching and search layer.

### Performance

| Dataset | Vectors | Dims | QPS | Notes |
|---------|---------|------|-----|-------|
| 1M | 1M | 128 | ~5,000-15,000 | all in RAM |
| 1M | 1M | 768 | ~2,000-6,000 | all in RAM |
| 1M | 1M | 1536 | ~800-2,500 | all in RAM |

- Sub-millisecond p50 latency typical for < 10M vectors
- Fastest option at small-to-medium scale (everything in RAM)

### Scale Limits

- **RAM-bound:** 1M x 1536-dim x 4 bytes = ~6 GB + HNSW ~12-18 GB
- Practical limit single node: ~10-50M vectors
- Redis Cluster: horizontal sharding

### Pricing

| Tier | Cost |
|------|------|
| Self-hosted Redis Stack | Free (RSAL/SSPL license) |
| Redis Cloud Free | 30 MB |
| Redis Cloud Essentials | ~$7-$30/mo |
| Redis Cloud Pro | ~$0.40-$0.55/GB/mo |

> **Note:** Redis changed license from BSD to RSAL/SSPL in 2024. **Valkey** (true open-source fork, Linux Foundation) is drop-in alternative.

### Installation

```bash
docker pull redis/redis-stack
docker run -p 6379:6379 redis/redis-stack
```

### Limitations

- Expensive at scale (RAM cost per GB)
- Not primary persistent store for TB-scale
- HNSW index must rebuild on cold start

---

## 8. Embedding Models

### Paid/API Models

#### OpenAI

| Model | Dimensions | MTEB Avg | Cost | Max Tokens |
|-------|-----------|----------|------|------------|
| text-embedding-3-small | 1536 (reducible to 512) | ~62-64 | $0.02/1M tokens | 8,191 |
| text-embedding-3-large | 3072 (reducible to 256) | ~64-66 | $0.13/1M tokens | 8,191 |

*text-embedding-ada-002 is legacy — do not use for new projects*

#### Cohere

| Model | Dimensions | MTEB Avg | Cost |
|-------|-----------|----------|------|
| embed-english-v3.0 | 1024 | ~64-65 | $0.10/1M tokens |
| embed-multilingual-v3.0 | 1024 | ~62-63 | $0.10/1M tokens |

### Free/Local Models (No Internet Required)

#### BGE Family (BAAI)

| Model | Dims | MTEB | RAM (fp32) | Speed (CPU) |
|-------|------|------|------------|-------------|
| BGE-small-en-v1.5 | 384 | ~62 | ~120 MB | Very fast |
| BGE-base-en-v1.5 | 768 | ~63-64 | ~430 MB | Fast |
| BGE-large-en-v1.5 | 1024 | ~64-65 | ~1.3 GB | Moderate |
| BGE-M3 (multilingual) | 1024 | ~65-66 | ~2.3 GB | Moderate |

#### Nomic Embed

| Model | Dims | MTEB | RAM | Notes |
|-------|------|------|-----|-------|
| nomic-embed-text-v1.5 | 768 (Matryoshka, reducible to 64) | ~62-64 | ~540 MB | Apache 2.0, fully open |

#### all-MiniLM-L6-v2 (sentence-transformers)

| Property | Value |
|----------|-------|
| Dimensions | 384 |
| MTEB Avg | ~56-58 |
| RAM | ~90 MB |
| Speed | ~14K sentences/sec on CPU |
| License | Apache 2.0 |
| Best for | Edge, mobile, constrained environments |

#### E5 Family (Microsoft)

| Model | Dims | MTEB | RAM |
|-------|------|------|-----|
| e5-small-v2 | 384 | ~59 | ~120 MB |
| e5-base-v2 | 768 | ~61-62 | ~430 MB |
| e5-large-v2 | 1024 | ~62-63 | ~1.3 GB |

#### GTE (Alibaba)

| Model | Dims | MTEB | RAM |
|-------|------|------|-----|
| gte-small | 384 | ~61 | ~120 MB |
| gte-base | 768 | ~62-63 | ~220 MB |
| gte-large | 1024 | ~63-64 | ~670 MB |

### Dimension vs Quality Tradeoffs

| Dimensions | Models | MTEB Range | RAM/1M vectors | Notes |
|------------|--------|------------|----------------|-------|
| 64-128 | Reduced Matryoshka | ~50-55 | ~250-500 MB | Extremely fast; low accuracy |
| 256-384 | MiniLM, BGE-small | ~56-62 | ~1-1.5 GB | Good speed/quality balance |
| **512-768** | **BGE-base, nomic** | **~62-64** | **~2-3 GB** | **Best value tradeoff** |
| 1024 | BGE-large, Cohere | ~63-66 | ~4 GB | Marginal gain over 768 |
| 1536 | OpenAI 3-small | ~62-64 | ~6 GB | API-only typically |
| 3072 | OpenAI 3-large | ~64-66 | ~12 GB | Maximum quality; expensive |

> **Key insight:** 768-dim models offer ~95% quality of 1536-dim at half storage cost. Recommended default for TB-scale memory server.

### Local Embedding Inference Options

```bash
# Option 1: sentence-transformers (Python)
pip install sentence-transformers
from sentence_transformers import SentenceTransformer
model = SentenceTransformer("BAAI/bge-base-en-v1.5")

# Option 2: Ollama
ollama pull nomic-embed-text
ollama pull mxbai-embed-large  # 1024-dim

# Option 3: llama.cpp with GGUF embedding models
# Fastest on CPU; supports quantization (Q4, Q8)

# Option 4: FastEmbed (Qdrant's lightweight library)
pip install fastembed
from fastembed import TextEmbedding
model = TextEmbedding("BAAI/bge-small-en-v1.5")
```

---

## 9. Comparative Summary

### Vector Databases

| Database | Best For | Max Scale | QPS (1M/768d) | Self-Host | Managed | On-Disk ANN | Distributed | License |
|----------|----------|-----------|---------------|-----------|---------|-------------|-------------|---------|
| **pgvector** | Postgres-native | ~100M | ~400-900 | Free | $19-50+/mo | Via pgvectorscale | Via Citus | Apache 2.0 |
| **Qdrant** | General purpose | 1B+ | ~600-1,200 | Free | $25-300+/mo | Yes (mmap) | Yes | Apache 2.0 |
| **Milvus** | Enterprise/GPU | 10B+ | ~1,500-2,500 | Free | $65-500+/mo | Yes (DiskANN) | Yes | Apache 2.0 |
| **ChromaDB** | Dev/prototyping | ~1M | ~50-150 | Free | Beta | No | No | Apache 2.0 |
| **Weaviate** | Multi-tenant SaaS | 500M+ | ~600-1,200 | Free | $25-580+/mo | Yes | Yes | BSD 3 |
| **sqlite-vec** | Local/offline | ~5M | ~20-200 | Free | N/A | Brute-force | No | MIT |
| **Redis Stack** | Cache layer | ~50M | ~2,000-6,000 | Free* | $7-custom | No | Yes | RSAL/SSPL* |

### Embedding Models Quick Reference

| Model | Dims | MTEB | RAM | Offline | Cost | Best Use |
|-------|------|------|-----|---------|------|----------|
| all-MiniLM-L6-v2 | 384 | ~57 | 90 MB | Yes | Free | Edge, constrained |
| BGE-small-en-v1.5 | 384 | ~62 | 120 MB | Yes | Free | Fast + good quality |
| **nomic-embed-text-v1.5** | **768** | **~63** | **540 MB** | **Yes** | **Free** | **Recommended default** |
| BGE-base-en-v1.5 | 768 | ~64 | 430 MB | Yes | Free | Best free at 768d |
| BGE-M3 | 1024 | ~66 | 2.3 GB | Yes | Free | Multilingual |
| OpenAI 3-small | 1536 | ~63 | N/A | No | $0.02/1M | API budget option |
| OpenAI 3-large | 3072 | ~65 | N/A | No | $0.13/1M | API max quality |

---

## 10. Recommended Architecture

```
+-------------------------------------------------------------+
|                    RECOMMENDED STACK                          |
+-------------------------------------------------------------+
|  Embedding Layer (offline-capable)                           |
|    Primary:  BGE-base-en-v1.5 (768d, 430 MB, Apache 2.0)   |
|    Fallback: nomic-embed-text-v1.5 (768d, Matryoshka)       |
|    API:      OpenAI text-embedding-3-small (when online)     |
+-------------------------------------------------------------+
|  Hot Cache Layer                                             |
|    Redis Stack / Valkey (recent vectors, < 10M)              |
|    Sub-ms latency; pure RAM                                  |
+-------------------------------------------------------------+
|  Primary Vector Store (TB-scale)                             |
|    Option A: Qdrant (best perf + filtering + ops balance)    |
|    Option B: Milvus (if GPU available or 10B+ vectors)       |
|    Option C: pgvector + pgvectorscale (Postgres ecosystem)   |
+-------------------------------------------------------------+
|  Local / Offline Mode                                        |
|    sqlite-vec (< 1M vectors, zero-dependency)                |
|    OR Qdrant embedded mode                                   |
+-------------------------------------------------------------+
```

### Decision Rules

- Start with **Qdrant self-hosted** — best combo of performance, filtering, on-disk support, operational simplicity
- Add **Redis/Valkey** as caching tier for hot vectors (recent memory accesses)
- Use **sqlite-vec** for offline/edge/local mode
- Switch to **Milvus** only if you need GPU acceleration or 1B+ vectors per node
- Use **pgvector** only if already committed to PostgreSQL; pair with **pgvectorscale** for DiskANN
- Avoid **ChromaDB** in production; use only for dev/testing
- Weaviate excellent if multi-tenancy or multi-modal is core requirement
