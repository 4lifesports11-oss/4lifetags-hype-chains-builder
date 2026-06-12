[build]
  publish = "."
  functions = "netlify/functions"

[functions]
  node_bundler = "esbuild"

[[redirects]]
  from = "/Hype-Chains/.netlify/functions/*"
  to = "/.netlify/functions/:splat"
  status = 200

[[redirects]]
  from = "/Hype-Chains/"
  to = "/index.html"
  status = 200

[[redirects]]
  from = "/Hype-Chains/*"
  to = "/index.html"
  status = 200

[[redirects]]
  from = "/hype-chains/"
  to = "/index.html"
  status = 200

[[redirects]]
  from = "/hype-chains/*"
  to = "/index.html"
  status = 200
