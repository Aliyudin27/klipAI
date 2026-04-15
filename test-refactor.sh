#!/bin/bash

echo "🧪 Testing AI Video Clipper Refactor..."
echo "========================================"
echo ""

# Test 1: Backend Health Check
echo "1️⃣  Testing Backend Health Check..."
HEALTH=$(curl -s http://localhost:8001/api/health)
if echo "$HEALTH" | grep -q "ok"; then
  echo "   ✅ Backend is healthy"
  echo "   Response: $HEALTH"
else
  echo "   ❌ Backend health check failed"
  exit 1
fi
echo ""

# Test 2: CORS Headers
echo "2️⃣  Testing CORS Configuration..."
CORS=$(curl -s -I -X OPTIONS http://localhost:8001/api/health -H "Origin: http://localhost:3000" | grep -i "access-control-allow-origin")
if [ ! -z "$CORS" ]; then
  echo "   ✅ CORS is configured"
  echo "   Headers: $CORS"
else
  echo "   ⚠️  CORS headers not found (may need OPTIONS request)"
fi
echo ""

# Test 3: Frontend Accessibility
echo "3️⃣  Testing Frontend Accessibility..."
FRONTEND=$(curl -s http://localhost:3000 | head -1)
if echo "$FRONTEND" | grep -q "<!doctype html>"; then
  echo "   ✅ Frontend is accessible"
else
  echo "   ❌ Frontend not responding"
  exit 1
fi
echo ""

# Test 4: Gemini API Configuration
echo "4️⃣  Checking Gemini API Configuration..."
if [ -f "/app/backend/.env" ]; then
  if grep -q "GEMINI_API_KEY" /app/backend/.env; then
    echo "   ✅ Gemini API key is configured in .env"
  else
    echo "   ❌ Gemini API key not found in .env"
  fi
else
  echo "   ❌ .env file not found"
fi
echo ""

# Test 5: Temp Directory
echo "5️⃣  Checking Temp Directory..."
if [ -d "/app/backend/temp" ]; then
  echo "   ✅ Temp directory exists: /app/backend/temp"
  echo "   Permissions: $(ls -ld /app/backend/temp)"
else
  echo "   ⚠️  Temp directory not found (will be created on first use)"
fi
echo ""

# Test 6: Required System Tools
echo "6️⃣  Checking Required Tools..."
command -v yt-dlp >/dev/null 2>&1 && echo "   ✅ yt-dlp installed: $(yt-dlp --version)" || echo "   ❌ yt-dlp not found"
command -v ffmpeg >/dev/null 2>&1 && echo "   ✅ ffmpeg installed: $(ffmpeg -version | head -1)" || echo "   ❌ ffmpeg not found"
command -v ffprobe >/dev/null 2>&1 && echo "   ✅ ffprobe installed" || echo "   ❌ ffprobe not found"
echo ""

# Test 7: Port Availability
echo "7️⃣  Checking Port Status..."
BACKEND_PORT=$(netstat -tulpn 2>/dev/null | grep ":8001" | head -1)
FRONTEND_PORT=$(netstat -tulpn 2>/dev/null | grep ":3000" | head -1)

if [ ! -z "$BACKEND_PORT" ]; then
  echo "   ✅ Backend listening on port 8001"
else
  echo "   ❌ Backend not listening on port 8001"
fi

if [ ! -z "$FRONTEND_PORT" ]; then
  echo "   ✅ Frontend listening on port 3000"
else
  echo "   ❌ Frontend not listening on port 3000"
fi
echo ""

# Summary
echo "========================================"
echo "🎉 Basic Tests Complete!"
echo ""
echo "Next Steps:"
echo "1. Open http://localhost:3000 in your browser"
echo "2. Try downloading a short YouTube video"
echo "3. Verify AI suggestions appear"
echo "4. Test clip creation and download"
echo ""
echo "For detailed logs:"
echo "  Backend:  tail -f /var/log/supervisor/backend.out.log"
echo "  Frontend: tail -f /var/log/supervisor/frontend.out.log"
