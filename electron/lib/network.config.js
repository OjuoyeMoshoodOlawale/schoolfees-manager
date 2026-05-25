/**
 * SCHOOLFEES MANAGER — NETWORK CONFIGURATION
 * ============================================
 * Edit this file to connect to a database on another PC on your network.
 *
 * USE CASE: You want multiple PCs (e.g. bursar's office + principal's office)
 * to share the same database.
 *
 * SETUP:
 * 1. On the HOST PC (the one that holds the database):
 *    - Share the "database" folder over your local network
 *    - Note the PC's IP address (run `ipconfig` in CMD → IPv4 Address)
 *
 * 2. On CLIENT PCs (other computers that want to access it):
 *    - Open this file
 *    - Set USE_NETWORK_DB to true
 *    - Set HOST_IP to the host PC's IP address
 *    - Set SHARE_PATH to the shared folder path
 *
 * EXAMPLE (Windows network share):
 *   USE_NETWORK_DB: true
 *   HOST_IP: '192.168.1.100'
 *   SHARE_PATH: '\\\\192.168.1.100\\schoolfees\\database'
 *
 * ⚠️  IMPORTANT NOTES:
 * - SQLite is NOT designed for concurrent multi-user writes
 * - Only ONE user should post payments or edit data at a time
 * - Best used as viewer/reporter on secondary PCs
 * - For true multi-user, contact developer to upgrade to PostgreSQL backend
 */

module.exports = {

  // Set to true to use a network/shared database instead of local
  USE_NETWORK_DB: false,

  // IP address of the PC hosting the database
  // Example: '192.168.1.100'
  HOST_IP: '',

  // Full path to the shared database folder
  // Windows example: '\\\\192.168.1.100\\schoolfees\\database'
  // Mapped drive example: 'Z:\\schoolfees\\database'
  SHARE_PATH: '',

  // Database filename (usually leave as default)
  DB_FILENAME: 'schoolfees.db',

  // Connection timeout in milliseconds (how long to wait if DB is busy)
  BUSY_TIMEOUT_MS: 5000,

}
