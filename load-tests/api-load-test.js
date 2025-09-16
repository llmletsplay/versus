import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

// Custom metrics
const errorRate = new Rate("errors");
const authErrorRate = new Rate("auth_errors");
const gameErrorRate = new Rate("game_errors");

// Load test configuration
export const options = {
  stages: [
    { duration: "2m", target: 10 }, // Ramp up to 10 users
    { duration: "5m", target: 10 }, // Stay at 10 users
    { duration: "2m", target: 20 }, // Ramp up to 20 users
    { duration: "5m", target: 20 }, // Stay at 20 users
    { duration: "2m", target: 50 }, // Ramp up to 50 users
    { duration: "5m", target: 50 }, // Stay at 50 users
    { duration: "2m", target: 100 }, // Ramp up to 100 users
    { duration: "5m", target: 100 }, // Stay at 100 users
    { duration: "5m", target: 0 }, // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"], // 95% of requests under 500ms
    http_req_failed: ["rate<0.1"], // Error rate under 10%
    errors: ["rate<0.05"], // Custom error rate under 5%
  },
};

const BASE_URL = "http://localhost:6789";

// Test data
const users = [
  {
    username: "testuser1",
    email: "test1@example.com",
    password: "password123",
  },
  {
    username: "testuser2",
    email: "test2@example.com",
    password: "password123",
  },
  {
    username: "testuser3",
    email: "test3@example.com",
    password: "password123",
  },
];

let authTokens = [];

export function setup() {
  console.log("Setting up load test data...");

  // Health check
  const healthResponse = http.get(`${BASE_URL}/api/v1/health`);
  check(healthResponse, {
    "health check passes": (r) => r.status === 200,
    "service is healthy": (r) => JSON.parse(r.body).status === "healthy",
  });

  // Register test users
  users.forEach((user, index) => {
    const registerResponse = http.post(
      `${BASE_URL}/api/v1/auth/register`,
      JSON.stringify(user),
      {
        headers: { "Content-Type": "application/json" },
      },
    );

    if (registerResponse.status === 201 || registerResponse.status === 409) {
      // Login to get token
      const loginResponse = http.post(
        `${BASE_URL}/api/v1/auth/login`,
        JSON.stringify({
          username: user.username,
          password: user.password,
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );

      if (loginResponse.status === 200) {
        const loginData = JSON.parse(loginResponse.body);
        authTokens[index] = loginData.data.token;
      }
    }
  });

  return { authTokens };
}

export default function (data) {
  const userIndex = Math.floor(Math.random() * users.length);
  const token = data.authTokens[userIndex];

  // Test scenario: Mix of authenticated and unauthenticated requests
  testHealthEndpoint();
  testGameListingEndpoint();

  if (token) {
    testAuthenticatedEndpoints(token);
    testGameCreationAndPlay(token);
  }

  sleep(1);
}

function testHealthEndpoint() {
  const response = http.get(`${BASE_URL}/api/v1/health`);

  const success = check(response, {
    "health check status is 200": (r) => r.status === 200,
    "health check response time < 100ms": (r) => r.timings.duration < 100,
    "health response is valid": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status && body.timestamp;
      } catch {
        return false;
      }
    },
  });

  if (!success) {
    errorRate.add(1);
  }
}

function testGameListingEndpoint() {
  const response = http.get(`${BASE_URL}/api/v1/games`);

  const success = check(response, {
    "games list status is 200": (r) => r.status === 200,
    "games list response time < 200ms": (r) => r.timings.duration < 200,
    "games list has data": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success && body.data;
      } catch {
        return false;
      }
    },
  });

  if (!success) {
    errorRate.add(1);
  }
}

function testAuthenticatedEndpoints(token) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  // Test user profile endpoint
  const profileResponse = http.get(`${BASE_URL}/api/v1/auth/me`, { headers });

  const authSuccess = check(profileResponse, {
    "profile endpoint status is 200": (r) => r.status === 200,
    "profile response is valid": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success && body.data && body.data.username;
      } catch {
        return false;
      }
    },
  });

  if (!authSuccess) {
    authErrorRate.add(1);
    errorRate.add(1);
  }

  // Test token refresh
  const refreshResponse = http.post(`${BASE_URL}/api/v1/auth/refresh`, "", {
    headers,
  });

  check(refreshResponse, {
    "token refresh works": (r) => r.status === 200,
  });
}

function testGameCreationAndPlay(token) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  // Create a tic-tac-toe game
  const createGameResponse = http.post(
    `${BASE_URL}/api/v1/games/tic-tac-toe/new`,
    JSON.stringify({
      config: { maxPlayers: 2 },
    }),
    { headers },
  );

  const gameSuccess = check(createGameResponse, {
    "game creation status is 201": (r) => r.status === 201,
    "game creation response time < 500ms": (r) => r.timings.duration < 500,
    "game ID returned": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success && body.data && body.data.gameId;
      } catch {
        return false;
      }
    },
  });

  if (!gameSuccess) {
    gameErrorRate.add(1);
    errorRate.add(1);
    return;
  }

  // Get game state
  try {
    const gameData = JSON.parse(createGameResponse.body);
    const gameId = gameData.data.gameId;

    const stateResponse = http.get(
      `${BASE_URL}/api/v1/games/tic-tac-toe/${gameId}/state`,
      { headers },
    );

    check(stateResponse, {
      "game state retrieval works": (r) => r.status === 200,
      "game state response time < 200ms": (r) => r.timings.duration < 200,
    });

    // Make a move
    const moveResponse = http.post(
      `${BASE_URL}/api/v1/games/tic-tac-toe/${gameId}/move`,
      JSON.stringify({
        player: "player1",
        moveData: { row: 0, col: 0 },
      }),
      { headers },
    );

    check(moveResponse, {
      "game move processing works": (r) => r.status === 200 || r.status === 400, // 400 for invalid moves is OK
      "move response time < 300ms": (r) => r.timings.duration < 300,
    });
  } catch (error) {
    console.error("Game testing error:", error);
    gameErrorRate.add(1);
    errorRate.add(1);
  }
}

export function teardown(data) {
  console.log("Load test completed");
  console.log(`Auth tokens used: ${data.authTokens.filter((t) => t).length}`);
}
