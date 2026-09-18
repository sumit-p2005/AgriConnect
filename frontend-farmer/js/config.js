/* Resolved once for all farmer frontend API calls */
const API_BASE_URL = (window.location.origin.includes("localhost:5000") || window.location.origin.includes("127.0.0.1"))
  ? "http://localhost:5000/api"
  : `${window.location.origin}/api`;
