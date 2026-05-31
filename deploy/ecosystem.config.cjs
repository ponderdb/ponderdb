// PM2 ecosystem config for PonderDB
module.exports = {
  apps: [
    {
      name: "ponderdb",
      script: "packages/server/dist/bin.js",
      cwd: "/opt/ponderdb",
      node_args: "--env-file=.env.production",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
      // Zero-downtime restart
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 5000,
      // Logs
      error_file: "/var/log/ponderdb/error.log",
      out_file: "/var/log/ponderdb/out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
