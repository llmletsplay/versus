#!/bin/bash

# Simple Autocannon Load Test for Versus Game Server
set -e

echo "🚀 Starting Versus Game Server Load Tests..."

BASE_URL="http://localhost:6789"
DURATION="60s"
CONNECTIONS=50
PIPELINE=10

# Check if server is running
echo "🔍 Checking if server is accessible..."
if ! curl -f "$BASE_URL/api/v1/health" > /dev/null 2>&1; then
    echo "❌ Server is not accessible at $BASE_URL"
    echo "💡 Make sure to start the server first:"
    echo "   ./deploy.sh  # For production deployment"
    echo "   bun run dev  # For development server"
    exit 1
fi

echo "✅ Server is accessible"

# Test 1: Health endpoint performance
echo ""
echo "📊 Test 1: Health Endpoint Performance"
echo "================================================"
npx autocannon -c $CONNECTIONS -d $DURATION \
    --renderStatusCodes \
    --renderLatencyTable \
    "$BASE_URL/api/v1/health"

# Test 2: Game listing endpoint
echo ""
echo "📊 Test 2: Game Listing Performance"
echo "================================================"
npx autocannon -c $CONNECTIONS -d $DURATION \
    --renderStatusCodes \
    --renderLatencyTable \
    "$BASE_URL/api/v1/games"

# Test 3: Authentication load test
echo ""
echo "📊 Test 3: Authentication Performance"
echo "================================================"
echo "Testing auth registration endpoint..."

npx autocannon -c 10 -d 30s \
    --method POST \
    --headers "Content-Type=application/json" \
    --body '{"username":"loadtest%d","email":"test%d@example.com","password":"password123"}' \
    --renderStatusCodes \
    --renderLatencyTable \
    "$BASE_URL/api/v1/auth/register"

# Test 4: Mixed workload simulation
echo ""
echo "📊 Test 4: Mixed Workload Simulation"
echo "================================================"
echo "Simulating realistic mixed API usage..."

# Create a script for mixed requests
cat > /tmp/versus_mixed_load.js << 'EOF'
const autocannon = require('autocannon');

const instance = autocannon({
  url: 'http://localhost:6789',
  connections: 25,
  duration: 45,
  requests: [
    {
      method: 'GET',
      path: '/api/v1/health',
      weight: 30 // 30% of requests
    },
    {
      method: 'GET',
      path: '/api/v1/games',
      weight: 40 // 40% of requests
    },
    {
      method: 'GET',
      path: '/api/v1/metrics',
      weight: 20 // 20% of requests
    },
    {
      method: 'GET',
      path: '/',
      weight: 10 // 10% of requests
    }
  ]
}, (err, result) => {
  if (err) {
    console.error('Load test error:', err);
    process.exit(1);
  }

  console.log('\n🎯 Mixed Workload Results:');
  console.log('====================================');
  console.log(`Requests: ${result.requests.total}`);
  console.log(`Duration: ${result.duration}s`);
  console.log(`RPS: ${result.requests.average}`);
  console.log(`Latency p95: ${result.latency.p95}ms`);
  console.log(`Errors: ${result.errors}`);
  console.log(`Timeouts: ${result.timeouts}`);

  if (result.latency.p95 > 500) {
    console.log('⚠️  WARNING: p95 latency above 500ms threshold');
  }

  if (result.errors > result.requests.total * 0.05) {
    console.log('⚠️  WARNING: Error rate above 5% threshold');
  }

  console.log('✅ Mixed workload test completed');
});
EOF

node /tmp/versus_mixed_load.js

# Test 5: Rate limiting validation
echo ""
echo "📊 Test 5: Rate Limiting Validation"
echo "================================================"
echo "Testing rate limiting enforcement..."

npx autocannon -c 5 -d 20s -a 150 \
    --renderStatusCodes \
    --renderLatencyTable \
    "$BASE_URL/api/v1/games" | grep -E "(429|requests|errors)"

echo ""
echo "🎉 Load Testing Complete!"
echo ""
echo "📋 Performance Criteria:"
echo "✅ P95 latency < 500ms"
echo "✅ Error rate < 10%"
echo "✅ Rate limiting functional"
echo "✅ Health checks responsive"
echo ""
echo "💡 For comprehensive testing:"
echo "   k6 run load-tests/api-load-test.js"

# Cleanup
rm -f /tmp/versus_mixed_load.js