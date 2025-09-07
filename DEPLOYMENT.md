# OM76.MCSS Production Deployment Guide

## Railway Deployment & Webhook Setup

### Phase 1: Deploy to Railway

1. **Deploy Application**:
   ```bash
   # Push to Railway (assuming Railway CLI is configured)
   railway login
   railway init
   railway up
   ```

2. **Configure Environment Variables**:
   Set these variables in Railway dashboard:
   ```
   NODE_ENV=production
   PORT=3000
   DATABASE_URL=<railway-postgresql-url>
   REDIS_URL=<railway-redis-url>
   WEBHOOK_BASE_URL=https://your-app-name.railway.app
   
   # Google Calendar API (configure with your values)
   GOOGLE_CLIENT_ID=<your-google-oauth-client-id>
   GOOGLE_CLIENT_SECRET=<your-google-oauth-client-secret>
   GOOGLE_REDIRECT_URI=https://your-app-name.railway.app/auth/callback
   
   # Production Security
   JWT_SECRET=<generate-secure-jwt-secret>
   WEBHOOK_SECRET=<generate-secure-webhook-secret>
   
   # Monitoring
   LOG_LEVEL=info
   ENABLE_METRICS=true
   ```

3. **Update Google Cloud Console**:
   - Add production redirect URI: `https://your-app-name.railway.app/auth/callback`
   - Update authorized domains in OAuth consent screen

### Phase 2: Re-authorize Calendars (Production)

Once deployed, re-authorize all calendars for production:

1. **Check Authorization Status**:
   ```bash
   curl https://your-app-name.railway.app/auth/status
   ```

2. **Re-authorize Each Calendar**:
   ```bash
   # Visit these URLs in browser to re-authorize for production:
   https://your-app-name.railway.app/auth/authorize/ani@om76.co
   https://your-app-name.railway.app/auth/authorize/kingmag@gmail.com  
   https://your-app-name.railway.app/auth/authorize/kingmagmobile@gmail.com
   ```

### Phase 3: Setup Production Webhooks

1. **Check Current Webhook Status**:
   ```bash
   curl https://your-app-name.railway.app/admin/webhooks/status
   ```

2. **Setup Webhooks for All Calendars**:
   ```bash
   curl -X POST https://your-app-name.railway.app/admin/webhooks/setup-all
   ```

3. **Verify Webhook Configuration**:
   ```bash
   curl https://your-app-name.railway.app/admin/webhooks/status
   ```

### Phase 4: Test Production Webhooks

1. **Create Test Event**: Create an event in any of your 3 calendars
2. **Verify Real-time Sync**: Check that block events appear in the other 2 calendars within seconds
3. **Monitor Logs**: Check Railway logs for webhook activity

### Webhook Management Commands

**Setup all webhooks**:
```bash
curl -X POST https://your-app-name.railway.app/admin/webhooks/setup-all
```

**Check webhook status**:
```bash
curl https://your-app-name.railway.app/admin/webhooks/status
```

**Clean up webhooks** (if needed):
```bash
curl -X DELETE https://your-app-name.railway.app/admin/webhooks/cleanup
```

### Monitoring & Health Checks

**Service Health**:
```bash
curl https://your-app-name.railway.app/health/detailed
```

**Calendar Status**:
```bash
curl https://your-app-name.railway.app/auth/status
```

**Admin Dashboard**:
```bash
curl https://your-app-name.railway.app/admin/dashboard
```

### Important Notes

1. **Webhook TTL**: Google Calendar webhooks expire after 1 hour by default. The system handles automatic renewals.

2. **Domain Verification**: Ensure your Railway domain is accessible publicly for webhook callbacks.

3. **SSL/HTTPS**: Railway automatically provides HTTPS. Webhooks require HTTPS endpoints.

4. **Rate Limits**: Google Calendar API has rate limits. The system includes built-in retry logic.

5. **Debugging**: Use Railway logs to monitor webhook activity and sync operations.

### Troubleshooting

**Webhooks Not Working**:
1. Check WEBHOOK_BASE_URL points to your Railway domain
2. Verify Railway app is publicly accessible
3. Check Google Cloud Console webhook permissions
4. Review Railway application logs

**Calendar Authorization Issues**:
1. Re-authorize calendars using production URLs
2. Check Google Cloud Console OAuth settings
3. Verify redirect URIs match production domain

**Sync Issues**:
1. Check job queue status: `/admin/dashboard`
2. Review sync logs: `/admin/logs`
3. Verify all calendars are active: `/auth/status`

---

## Current Status: Ready for Production Deployment

✅ Core sync functionality complete
✅ Webhook management endpoints ready  
✅ Production deployment configuration prepared
✅ 3-calendar setup (primary calendar removed)

**Next Steps**: Deploy to Railway and follow Phase 1-4 above.