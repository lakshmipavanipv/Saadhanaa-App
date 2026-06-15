const admin = require('firebase-admin');

// Initialise Firebase Admin once. Uses GOOGLE_APPLICATION_CREDENTIALS
// (path to the service-account JSON) from the environment.
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
}

/**
 * Express middleware — verifies the Firebase ID token from the
 * `Authorization: Bearer <token>` header and attaches req.uid + req.user.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_token' });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
      name: decoded.name || null,
      signInProvider: decoded.firebase?.sign_in_provider || null,
    };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid_token', detail: e.message });
  }
}

module.exports = { admin, requireAuth };
