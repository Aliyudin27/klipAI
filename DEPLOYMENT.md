# Deployment Guide

## Services Status

✅ Backend: Running on port 8001 (Node.js + Express)
✅ Frontend: Running on port 3000 (React + Vite)
✅ FFmpeg: Installed and ready
✅ yt-dlp: Installed and ready
✅ Gemini API: Configured

## Access URLs

- **Frontend**: Port 3000
- **Backend API**: Port 8001
- **Health Check**: `curl http://localhost:8001/api/health`

## Starting Services

The services are currently running in background. To manage them:

```bash
# Check if services are running
netstat -tulpn | grep -E ':(3000|8001)'

# Restart backend
pkill -f "node server.js" && cd /app/backend && node server.js > /var/log/supervisor/backend.out.log 2>&1 &

# Restart frontend  
pkill -f "vite" && cd /app/frontend && yarn dev --host 0.0.0.0 --port 3000 > /var/log/supervisor/frontend.out.log 2>&1 &
```

## Testing the Application

1. **Health Check**:
```bash
curl http://localhost:8001/api/health
```

2. **Test Video Download** (example with a short YouTube video):
```bash
curl -X POST http://localhost:8001/api/download \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

3. **Access Frontend**:
Open http://localhost:3000 in your browser

## Environment Variables

### Backend (.env)
```
PORT=8001
GEMINI_API_KEY=AIzaSyCAJhkuZRe2sxknaP-B7EjKiC-YvqgR_uw
TEMP_DIR=/tmp/video-clipper
```

### Frontend (.env)
```
VITE_BACKEND_URL=
```
Note: Empty value makes it use relative URLs, which works with Kubernetes ingress

## Logs

```bash
# Backend logs
tail -f /var/log/supervisor/backend.out.log
tail -f /var/log/supervisor/backend.err.log

# Frontend logs
tail -f /var/log/supervisor/frontend.out.log
tail -f /var/log/supervisor/frontend.err.log
```

## Architecture

```
User Browser (Port 3000)
    ↓
React Frontend
    ↓
API Calls (/api/*)
    ↓
Node.js Backend (Port 8001)
    ↓
├── yt-dlp (Video Download)
├── Gemini AI (Transcript Analysis)
└── FFmpeg (Video Processing)
```

## Kubernetes Ingress

The application is configured to work with Kubernetes ingress:
- All `/api/*` routes are automatically routed to backend (port 8001)
- Other routes go to frontend (port 3000)

## Next Steps

1. The application is ready to use!
2. Access it through the Emergent preview URL
3. Try uploading a video and see the AI suggestions
4. Customize the clip range and download your processed video

## Troubleshooting

**Backend not responding:**
```bash
ps aux | grep "node server.js"
curl http://localhost:8001/api/health
```

**Frontend not loading:**
```bash
ps aux | grep vite
curl http://localhost:3000
```

**Video processing fails:**
```bash
# Check FFmpeg
ffmpeg -version

# Check yt-dlp
yt-dlp --version
```
