/**
 * Fetches posts from WordPress REST API and maps them to site format.
 */
(function (global) {
  'use strict';

  const CATEGORY_SLUG_MAP = {
    bihar: 'बिहार',
    politics: 'राजनीति',
    rajniti: 'राजनीति',
    desh: 'देश',
    national: 'देश',
    crime: 'जुर्म',
    jurm: 'जुर्म',
    career: 'करियर',
    sports: 'खेल',
    khel: 'खेल',
    entertainment: 'मूवी मसाला',
    movies: 'मूवी मसाला',
    religion: 'धर्म',
    dharm: 'धर्म',
    business: 'कारोबार',
    karobar: 'कारोबार',
    jharkhand: 'झारखंड',
  };

  const CATEGORY_MAP = {
    'राजनीति': 'rajniti',
    'बिहार': 'bihar',
    'देश': 'desh',
    'जुर्म': 'jurm',
    'करियर': 'career',
    'झारखंड': 'jharkhand',
    'खेल': 'khel',
    'लाइफ स्टाइल': 'lifestyle',
    'मूवी मसाला': 'movies',
    'धर्म': 'dharm',
    'कारोबार': 'karobar',
  };

  const DEFAULT_IMAGE =
    'https://images.unsplash.com/photo-1504711434966-e33886168f5c?w=400&q=80';

  function wpBase() {
    return (WP_CONFIG.WP_API_URL || '').trim().replace(/\/$/, '');
  }

  /** Always use full REST path e.g. /wp/v2/posts */
  function restPath(endpoint) {
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return path.startsWith('/wp/v2') ? path : `/wp/v2${path}`;
  }

  /** Build REST URL: proxy (no CORS) | rest_route | pretty permalinks */
  function apiUrl(endpoint, params = {}) {
    const path = restPath(endpoint);
    const query = new URLSearchParams(params);
    const qs = query.toString();

    if (WP_CONFIG.USE_LOCAL_PROXY && typeof window !== 'undefined') {
      const origin = window.location.origin;
      return `${origin}/wp-proxy${path}${qs ? `?${qs}` : ''}`;
    }

    const base = wpBase();
    if (!base) throw new Error('WP_API_URL is empty — set it in js/config.js');

    if (WP_CONFIG.USE_REST_ROUTE) {
      const restRoute = path;
      const restParams = new URLSearchParams({
        rest_route: restRoute,
        ...Object.fromEntries(query),
      });
      return `${base}/index.php?${restParams}`;
    }

    const jsonPath = path.startsWith('/wp/v2') ? path.replace('/wp/v2', '') : path;
    return `${base}/wp-json/wp/v2${jsonPath}${qs ? `?${qs}` : ''}`;
  }

  /** Normalize WordPress date fields to a valid Date */
  function parsePostDate(post) {
    const raw = post?.date || post?.date_gmt || post?.modified || post?.modified_gmt;
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatTime(dateStr) {
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    if (!date || Number.isNaN(date.getTime())) return '';

    const now = new Date();
    const diffMs = now - date;
    if (diffMs < 0) return 'अभी';

    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMs / 3600000);
    const days = Math.floor(diffMs / 86400000);

    if (mins < 1) return 'अभी';
    if (mins < 60) return `${mins} मिनट पहले`;
    if (hours < 24) return `${hours} घंटे पहले`;
    if (days === 1) return 'कल';
    if (days < 7) return `${days} दिन पहले`;
    return date.toLocaleDateString('hi-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  function formatAbsoluteTime(dateStr) {
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    if (!date || Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('hi-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function getFeaturedImage(post) {
    const media = post._embedded?.['wp:featuredmedia']?.[0];
    if (!media) return DEFAULT_IMAGE;
    return (
      media.media_details?.sizes?.medium?.source_url ||
      media.media_details?.sizes?.large?.source_url ||
      media.source_url ||
      DEFAULT_IMAGE
    );
  }

  function getCategories(post) {
    const terms = post._embedded?.['wp:term'] || [];
    const cats = terms[0] || [];
    return cats.map((c) => {
      const slug = (c.slug || '').toLowerCase();
      return CATEGORY_SLUG_MAP[slug] || c.name;
    });
  }

  function getTags(post) {
    const terms = post._embedded?.['wp:term'] || [];
    const tags = terms[1] || [];
    return tags.map((t) => t.slug);
  }

  function mapPost(post) {
    const terms = post._embedded?.['wp:term'] || [];
    const rawCats = terms[0] || [];
    const categories = getCategories(post);
    const primaryRaw = rawCats[0];
    const category = categories[0] || 'बिहार';
    const categorySlug = (primaryRaw?.slug || 'general').toLowerCase();
    const tags = getTags(post);
    const breaking =
      tags.includes('breaking') ||
      tags.includes('ब्रेकिंग') ||
      categories.some((c) => c.toLowerCase().includes('breaking'));

    const published = parsePostDate(post);
    const dateIso = published ? published.toISOString() : '';

    return {
      id: post.id,
      title: post.title?.rendered || '',
      excerpt: post.excerpt?.rendered?.replace(/<[^>]+>/g, '') || '',
      content: post.content?.rendered || '',
      category,
      categorySlug,
      categories,
      date: dateIso,
      breaking,
      image: getFeaturedImage(post),
      link: `article.html?id=${post.id}`,
      author: post._embedded?.author?.[0]?.name || '',
      slug: post.slug,
    };
  }

  function groupByCategory(posts) {
    const groups = new Map();
    posts.forEach((post) => {
      const key = post.category;
      if (!groups.has(key)) {
        groups.set(key, {
          name: key,
          slug: post.categorySlug,
          posts: [],
        });
      }
      groups.get(key).posts.push(post);
    });
    return [...groups.values()].sort((a, b) => b.posts.length - a.posts.length);
  }

  async function fetchNavCategories() {
    try {
      const cats = await wpFetch('/categories', {
        per_page: 50,
        orderby: 'count',
        order: 'desc',
      });
      return cats
        .filter((c) => c.slug !== 'uncategorized' && c.count > 0)
        .map((c) => ({
          name: CATEGORY_SLUG_MAP[c.slug] || c.name,
          slug: c.slug,
          count: c.count,
          id: c.id,
        }));
    } catch {
      return [];
    }
  }

  async function wpFetch(endpoint, params = {}) {
    const url = apiUrl(endpoint, params);
    const res = await fetch(url);
    if (!res.ok) {
      const hint = WP_CONFIG.USE_LOCAL_PROXY
        ? ''
        : ' — try USE_LOCAL_PROXY: true and run python3 dev-server.py';
      throw new Error(`WordPress API ${res.status}${hint}`);
    }
    return res.json();
  }

  async function fetchPosts(params = {}) {
    const posts = await wpFetch('/posts', {
      per_page: params.per_page || WP_CONFIG.POSTS_PER_PAGE,
      _embed: '1',
      orderby: 'date',
      order: 'desc',
      ...params,
    });
    return posts.map(mapPost);
  }

  async function fetchPostById(id) {
    const post = await wpFetch(`/posts/${id}`, { _embed: '1' });
    return mapPost(post);
  }

  async function fetchPostsByCategory(categoryName, limit = 6) {
    const cats = await wpFetch('/categories', {
      search: categoryName,
      per_page: 20,
    });
    const match = cats.find(
      (c) => c.name === categoryName || c.slug === categoryName
    );
    if (!match) return [];
    return fetchPosts({ categories: match.id, per_page: limit });
  }

  async function loadAllNewsData() {
    const all = await fetchPosts({ per_page: 50 });
    const breaking = all.filter((p) => p.breaking);
    const categorySections = groupByCategory(all);
    const navCategories = await fetchNavCategories();

    const data = { latest: all.slice(0, 12) };

    return { data, all, breaking, categorySections, navCategories };
  }

  global.WordPressAPI = {
    fetchPosts,
    fetchPostById,
    fetchPostsByCategory,
    fetchNavCategories,
    loadAllNewsData,
    mapPost,
    formatTime,
    formatAbsoluteTime,
    parsePostDate,
    apiUrl,
    groupByCategory,
    CATEGORY_MAP,
    CATEGORY_SLUG_MAP,
  };
})(window);
