/**
 * WordPress connection settings
 */
const WP_CONFIG = {
  USE_WORDPRESS: true,

  /** Full WordPress folder URL — include /wordpress if installed in subfolder */
  WP_API_URL: 'http://localhost:8000/wordpress',

  /** Run: python3 dev-server.py — then open http://localhost:8080 */
  USE_LOCAL_PROXY: false,

  /**
   * true = use index.php?rest_route= (required for your setup)
   * /wordpress/wp-json/... may show the blog page instead of JSON
   */
  USE_REST_ROUTE: true,

  POSTS_PER_PAGE: 20,
};
