import type {NextConfig} from "next";

const production=process.env.NODE_ENV==="production";

const securityHeaders=[
 {key:"X-Content-Type-Options",value:"nosniff"},
 {key:"X-Frame-Options",value:"DENY"},
 {key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},
 {key:"Permissions-Policy",value:"camera=(),microphone=(),geolocation=(),browsing-topics=()"},
 ...(production?[{key:"Strict-Transport-Security",value:"max-age=63072000; includeSubDomains; preload"}]:[])
];

const nextConfig:NextConfig={
 poweredByHeader:false,
 devIndicators:false,
 outputFileTracingExcludes:{"/*":["./Storage/**/*","./Logs/**/*","./.env","./.env.*","./.next/**/*","./tests/**/*","./docs/**/*","./migrations/**/*"]},
 headers:async()=>[{source:"/:path*",headers:securityHeaders}]
};

export default nextConfig;