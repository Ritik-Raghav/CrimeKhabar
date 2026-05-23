(function () {
  'use strict';

  let NEWS_DATA = typeof window.NEWS_DATA !== 'undefined' ? window.NEWS_DATA : {};
  let ALL_ARTICLES = typeof window.ALL_ARTICLES !== 'undefined' ? window.ALL_ARTICLES : [];
  let timeRefreshTimer = null;

  function isHomePage() {
    return Boolean(document.getElementById('latestNews'));
  }

  function escapeHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  /**
   * Single source of truth: every category section is `cat-${slug}`.
   * Slug comes straight from the WordPress category, normalized.
   */
  function slugify(value) {
    return (value || '')
      .toString()
      .toLowerCase()
      .trim()
      .replace(/[\s/]+/g, '-')
      .replace(/[^a-z0-9\-\u0900-\u097F]/g, '');
  }

  function resolveCategoryId(section) {
    const slug = slugify(section.slug || section.name);
    return slug ? `cat-${slug}` : 'cat-general';
  }

  function getCategoryAnchor(section) {
    const id = resolveCategoryId(section);
    return isHomePage() ? `#${id}` : `index.html#${id}`;
  }

  /** Scroll to category when landing on index.html#section from another page */
  function scrollToCategoryFromHash() {
    if (!isHomePage()) return;
    const hash = window.location.hash;
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function formatRelativeTime(dateStr) {
    if (!dateStr) return '';
    if (typeof WordPressAPI !== 'undefined' && WordPressAPI.formatTime) {
      return WordPressAPI.formatTime(dateStr);
    }
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '';
    const mins = Math.floor((Date.now() - date) / 60000);
    if (mins < 1) return 'अभी';
    if (mins < 60) return `${mins} मिनट पहले`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} घंटे पहले`;
    return date.toLocaleDateString('hi-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function timeHtml(article) {
    const dateStr = article?.date;
    if (!dateStr) return '';
    const label = formatRelativeTime(dateStr);
    const title =
      typeof WordPressAPI !== 'undefined' && WordPressAPI.formatAbsoluteTime
        ? WordPressAPI.formatAbsoluteTime(dateStr)
        : '';
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    return `<time datetime="${escapeHtml(dateStr)}" data-timestamp="${escapeHtml(dateStr)}"${titleAttr}>${escapeHtml(label || '—')}</time>`;
  }

  function refreshRelativeTimes() {
    document.querySelectorAll('[data-timestamp]').forEach((el) => {
      const updated = formatRelativeTime(el.getAttribute('data-timestamp'));
      if (updated) el.textContent = updated;
    });
  }

  function startTimeRefresh() {
    refreshRelativeTimes();
    if (timeRefreshTimer) clearInterval(timeRefreshTimer);
    timeRefreshTimer = setInterval(refreshRelativeTimes, 60000);
  }

  function buildNavLinks(sections) {
    return (sections || [])
      .map(
        (s) =>
          `<a href="${getCategoryAnchor(s)}" data-category="${escapeHtml(s.slug || s.name)}">${escapeHtml(s.name)}</a>`
      )
      .join('');
  }

  /**
   * Merge nav categories with grouped sections.
   * Only categories that have posts get a nav link (so every link has a target).
   */
  function buildCategoryList(categorySections, navCategories) {
    const sectionsBySlug = new Map();
    (categorySections || []).forEach((s) => {
      sectionsBySlug.set(slugify(s.slug || s.name), s);
    });

    // Prefer navCategories order (count desc), keep only ones that have posts.
    if (navCategories?.length) {
      const merged = [];
      const seen = new Set();
      navCategories.forEach((c) => {
        const key = slugify(c.slug || c.name);
        const sec = sectionsBySlug.get(key);
        if (!sec) return;
        merged.push({ name: c.name || sec.name, slug: sec.slug, posts: sec.posts });
        seen.add(key);
      });
      // Include any sections WP categories endpoint missed.
      (categorySections || []).forEach((s) => {
        const key = slugify(s.slug || s.name);
        if (!seen.has(key)) merged.push(s);
      });
      return merged;
    }
    return categorySections || [];
  }

  function renderNavbar(categorySections, navCategories) {
    const sections = buildCategoryList(categorySections, navCategories);

    const mainNav = document.getElementById('mainNav');
    const mobileNav = document.getElementById('mobileMenuNav');
    const footerCats = document.getElementById('footerCategories');

    const homeLink = '<a href="index.html" class="nav-home active">होम</a>';
    const catLinks = buildNavLinks(sections);

    if (mainNav) {
      mainNav.innerHTML = homeLink + catLinks;
    }
    if (mobileNav) {
      mobileNav.innerHTML = '<a href="index.html">होम</a>' + catLinks;
    }
    if (footerCats) {
      footerCats.innerHTML = sections
        .map((s) => `<li><a href="${getCategoryAnchor(s)}">${escapeHtml(s.name)}</a></li>`)
        .join('');
    }
  }

  let navHighlightCleanup = null;

  function initNavHighlight() {
    if (navHighlightCleanup) {
      navHighlightCleanup();
      navHighlightCleanup = null;
    }

    const nav = document.getElementById('mainNav');
    if (!nav || !isHomePage()) return;

    const linkByHash = new Map();
    nav.querySelectorAll('a[href*="#"]').forEach((a) => {
      const href = a.getAttribute('href') || '';
      const hash = href.split('#').pop();
      if (hash && document.getElementById(hash)) {
        linkByHash.set(hash, a);
      }
    });

    if (!linkByHash.size) return;

    const homeLink = nav.querySelector('.nav-home');
    let lockedId = null;
    let lockTimer = null;
    const visible = new Set();

    function setActive(id) {
      nav.querySelectorAll('a').forEach((a) => a.classList.remove('active'));
      if (id && linkByHash.has(id)) {
        linkByHash.get(id).classList.add('active');
      } else {
        homeLink?.classList.add('active');
      }
    }

    function pickActiveFromVisible() {
      if (!visible.size) return null;
      let bestId = null;
      let bestTop = Infinity;
      visible.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const top = el.getBoundingClientRect().top;
        if (top < bestTop) {
          bestTop = top;
          bestId = id;
        }
      });
      return bestId;
    }

    function update() {
      if (lockedId) return;
      const id = pickActiveFromVisible();
      if (id) setActive(id);
      else if (window.scrollY < 200) setActive(null);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        });
        update();
      },
      { rootMargin: '-110px 0px -55% 0px', threshold: 0 }
    );

    linkByHash.forEach((_link, hash) => {
      const el = document.getElementById(hash);
      if (el) observer.observe(el);
    });

    const clickHandlers = [];
    linkByHash.forEach((link, hash) => {
      const handler = () => {
        lockedId = hash;
        setActive(hash);
        clearTimeout(lockTimer);
        lockTimer = setTimeout(() => {
          lockedId = null;
          update();
        }, 900);
      };
      link.addEventListener('click', handler);
      clickHandlers.push([link, handler]);
    });

    navHighlightCleanup = () => {
      observer.disconnect();
      clearTimeout(lockTimer);
      clickHandlers.forEach(([link, handler]) => link.removeEventListener('click', handler));
    };
  }

  function renderCategorySections(categorySections, navCategories) {
    const container =
      document.getElementById('categorySections') ||
      document.getElementById('dynamicCategorySections');
    if (!container) return;

    const sections = buildCategoryList(categorySections, navCategories);

    if (!sections.length) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = sections
      .map((section) => {
        const id = resolveCategoryId(section);
        const posts = section.posts || [];
        const postsHtml = posts.length
          ? posts.slice(0, 6).map(createNewsCard).join('')
          : '<p class="loading-msg">इस श्रेणी में अभी कोई खबर नहीं</p>';
        return `
        <section class="section-block" id="${escapeHtml(id)}">
          <div class="section-header">
            <h2>${escapeHtml(section.name)}</h2>
            <span class="section-count">${posts.length} खबरें</span>
          </div>
          <div class="news-grid">${postsHtml}</div>
        </section>`;
      })
      .join('');
  }


  function createNewsCard(article) {
    const href = article.link || `article.html?id=${article.id || ''}`;
    const breakingBadge = article.breaking
      ? '<span class="badge badge-breaking">Breaking</span>'
      : '';
    return `
      <article class="news-card">
        <a href="${href}">
          <div class="card-image">
            <img src="${escapeHtml(article.image)}" alt="" loading="lazy">
            ${breakingBadge}
          </div>
          <div class="card-body">
            <span class="card-category">${escapeHtml(article.category)}</span>
            <h3>${escapeHtml(article.title)}</h3>
            <span class="card-time">${timeHtml(article)}</span>
          </div>
        </a>
      </article>
    `;
  }

  function createHorizontalNewsCard(article) {
    const href = article.link || `article.html?id=${article.id || ''}`;
    const breakingBadge = article.breaking
      ? '<span class="badge badge-breaking">Breaking</span>'
      : '';
    return `
      <article class="news-card card-horizontal">
        <a href="${href}">
          <div class="card-image">
            <img src="${escapeHtml(article.image)}" alt="" loading="lazy">
            ${breakingBadge}
          </div>
          <div class="card-body">
            <span class="card-category">${escapeHtml(article.category)}</span>
            <h3>${escapeHtml(article.title)}</h3>
            <span class="card-time">${timeHtml(article)}</span>
          </div>
        </a>
      </article>
    `;
  }

  function getBreakingPosts(breaking, all, limit = 5) {
    const posts = breaking?.length ? breaking : all || [];
    return posts.slice(0, limit);
  }

  function renderBreakingSidebar(posts) {
    const el = document.getElementById('breakingSidebarList');
    if (!el) return;
    if (!posts?.length) {
      el.innerHTML = '<li><p class="loading-msg">कोई ब्रेकिंग खबर नहीं</p></li>';
      return;
    }
    el.innerHTML = posts
      .map(
        (p) => `
        <li>
          <a href="${p.link}">
            <img src="${escapeHtml(p.image)}" alt="" loading="lazy">
            <div>
              <h3>${escapeHtml(p.title)}</h3>
              <span class="card-time">${timeHtml(p)}</span>
            </div>
          </a>
        </li>`
      )
      .join('');
  }

  function renderFeaturedRow(posts) {
    const el = document.getElementById('featuredRow');
    if (!el) return;
    if (!posts?.length) {
      el.innerHTML = '';
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    el.innerHTML = posts.map(createHorizontalNewsCard).join('');
  }

  function renderMustRead(posts) {
    const el = document.getElementById('mustReadList');
    if (!el) return;
    if (!posts?.length) {
      el.innerHTML = '<li><p class="loading-msg">कोई खबर नहीं</p></li>';
      return;
    }
    el.innerHTML = posts
      .map(
        (p) =>
          `<li><a href="${p.link}">▶ ${escapeHtml(p.title)}</a></li>`
      )
      .join('');
  }

  function renderNewsGrid(containerId, articles, limit) {
    const el = document.getElementById(containerId);
    if (!el || !articles?.length) return;
    const items = limit ? articles.slice(0, limit) : articles;
    el.innerHTML = items.map(createNewsCard).join('');
  }

  function renderTrending(articles) {
    const el = document.getElementById('trendingList');
    if (!el) return;
    const trending = (articles || NEWS_DATA.latest || []).slice(0, 8);
    if (!trending.length) {
      el.innerHTML = '<li><p class="loading-msg">कोई खबर नहीं</p></li>';
      return;
    }
    el.innerHTML = trending
      .map(
        (item, i) => `
        <li>
          <a href="${item.link || 'article.html'}">
            <span class="trending-num">${i + 1}</span>
            <img src="${escapeHtml(item.image)}" alt="" loading="lazy">
            <h4>${escapeHtml(item.title)}</h4>
          </a>
        </li>
      `
      )
      .join('');
  }

  function renderBreakingTicker(breakingPosts) {
    const ticker = document.getElementById('breakingTicker');
    if (!ticker) return;
    if (!breakingPosts?.length) {
      ticker.innerHTML = '<span>खबरें लोड हो रही हैं...</span>';
      return;
    }
    const items = breakingPosts
      .map((p) => `<a href="${p.link}">${escapeHtml(p.title)}</a><span class="ticker-sep">✦</span>`)
      .join('');
    ticker.innerHTML = items + items;
  }

  function renderHero(post) {
    if (!post) return;
    const heroLink = document.querySelector('.hero-main .hero-link');
    if (!heroLink) return;

    heroLink.href = post.link;
    const img = heroLink.querySelector('.hero-image img');
    const title = heroLink.querySelector('.hero-title');
    const time = heroLink.querySelector('.hero-meta .time');
    const author = heroLink.querySelector('.hero-meta .author');
    const catBadge = heroLink.querySelector('.badge-category');
    const breakingBadge = heroLink.querySelector('.badge-breaking');

    if (img) {
      img.src = post.image.replace('w=400', 'w=800');
      img.alt = post.title;
    }
    if (title) title.textContent = post.title;
    if (time) {
      time.innerHTML = timeHtml(post);
    }
    if (author) {
      author.textContent = post.author || '';
      author.style.display = post.author ? '' : 'none';
    }
    if (catBadge) catBadge.textContent = post.category;
    if (breakingBadge) breakingBadge.hidden = !post.breaking;
  }

  function renderHomePage(all, breaking) {
    const breakingPosts = getBreakingPosts(breaking, all, 5);
    const sidebarPosts = breakingPosts.length ? breakingPosts : all.slice(0, 5);

    renderHero(all[0]);
    renderBreakingTicker(breakingPosts.length ? breakingPosts : all.slice(0, 5));
    renderBreakingSidebar(sidebarPosts);
    renderFeaturedRow(all.slice(1, 5));
    renderMustRead(all.slice(5, 9));
    renderNewsGrid('latestNews', all, 12);
    renderTrending(all);
  }

  function plainText(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.innerHTML = str;
    return (d.textContent || '').trim();
  }

  async function ensureArticlesForSearch() {
    if (ALL_ARTICLES.length > 0) return ALL_ARTICLES;
    if (WP_CONFIG.USE_WORDPRESS && typeof WordPressAPI !== 'undefined') {
      try {
        const posts = await WordPressAPI.fetchPosts({ per_page: 50 });
        ALL_ARTICLES = posts;
        window.ALL_ARTICLES = posts;
        return posts;
      } catch (e) {
        console.warn('Search: could not load articles', e);
      }
    }
    return ALL_ARTICLES;
  }

  function initSearch() {
    const overlay = document.getElementById('searchOverlay');
    const input = document.getElementById('searchInput');
    const results = document.getElementById('searchResults');
    const form = document.getElementById('headerSearchForm');
    const clearBtn = document.getElementById('searchClear');
    const closeBtn = document.getElementById('searchClose');
    const openBtn = document.getElementById('searchBtn');
    const mobileSearchBtn = document.getElementById('mobileSearchBtn');

    if (!overlay || !input || !results) return;

    let debounceTimer = null;

    function openSearch() {
      overlay.hidden = false;
      document.body.style.overflow = 'hidden';
      openBtn?.setAttribute('aria-expanded', 'true');
      setTimeout(() => input.focus(), 50);
    }

    function closeSearch() {
      overlay.hidden = true;
      document.body.style.overflow = '';
      openBtn?.setAttribute('aria-expanded', 'false');
      input.value = '';
      results.innerHTML = '';
      updateClearBtn();
    }

    function updateClearBtn() {
      if (!clearBtn) return;
      clearBtn.hidden = !input.value.trim();
    }

    function renderSearchResults(matches, q) {
      if (!q) {
        results.innerHTML = '';
        return;
      }
      if (!matches.length) {
        results.innerHTML = '<p class="no-result">कोई खबर नहीं मिली</p>';
        return;
      }
      results.innerHTML = matches
        .slice(0, 10)
        .map(
          (a) =>
            `<a class="search-result-item" href="${a.link || `article.html?id=${a.id}`}">
              <strong>${escapeHtml(plainText(a.title))}</strong>
              <small>${escapeHtml(a.category)} · ${timeHtml(a)}</small>
            </a>`
        )
        .join('');
      refreshRelativeTimes();
    }

    async function runSearch() {
      const q = input.value.trim().toLowerCase();
      updateClearBtn();
      if (!q) {
        results.innerHTML = '';
        return;
      }
      results.innerHTML = '<p class="search-loading">खोज रहे हैं...</p>';
      const pool = await ensureArticlesForSearch();
      const matches = pool.filter((a) => {
        const title = plainText(a.title).toLowerCase();
        const cat = (a.category || '').toLowerCase();
        return title.includes(q) || cat.includes(q);
      });
      renderSearchResults(matches, q);
    }

    openBtn?.addEventListener('click', openSearch);
    mobileSearchBtn?.addEventListener('click', openSearch);
    closeBtn?.addEventListener('click', closeSearch);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSearch();
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await runSearch();
      const first = results.querySelector('.search-result-item');
      if (first) window.location.href = first.getAttribute('href');
    });

    input.addEventListener('input', () => {
      updateClearBtn();
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runSearch, 180);
    });

    clearBtn?.addEventListener('click', () => {
      input.value = '';
      updateClearBtn();
      results.innerHTML = '';
      input.focus();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !overlay.hidden) {
        closeSearch();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openSearch();
      }
    });
  }

  function initMobileMenu() {
    const menuBtn = document.getElementById('menuBtn');
    const mainNav = document.getElementById('mainNav');
    const moreBtn = document.getElementById('moreNavBtn');
    const overlay = document.getElementById('mobileMenuOverlay');
    const closeBtn = document.getElementById('mobileMenuClose');
    const trendingBtn = document.getElementById('mobileTrendingBtn');

    menuBtn?.addEventListener('click', () => {
      mainNav?.classList.toggle('open');
    });

    trendingBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.getElementById('trendingList');
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    function openMore() {
      overlay?.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function closeMore() {
      overlay?.classList.remove('open');
      document.body.style.overflow = '';
    }

    moreBtn?.addEventListener('click', openMore);
    closeBtn?.addEventListener('click', closeMore);
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) closeMore();
    });

    overlay?.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', closeMore);
    });
  }

  function showLoading() {
    document
      .querySelectorAll(
        '#latestNews, .category-grid, #trendingList, #breakingSidebarList, #mustReadList, #featuredRow, #breakingTicker'
      )
      .forEach((el) => {
        if (!el) return;
        if (el.id === 'breakingTicker') {
          el.innerHTML = '<span>खबरें लोड हो रही हैं...</span>';
        } else if (el.id === 'featuredRow') {
          el.innerHTML = '';
        } else {
          el.innerHTML = '<p class="loading-msg">खबरें लोड हो रही हैं...</p>';
        }
      });
  }

  function showWpError(msg) {
    const main = document.querySelector('.main-content');
    if (main) {
      const banner = document.createElement('div');
      banner.className = 'wp-error-banner';
      banner.innerHTML = `<p><strong>WordPress कनेक्शन विफल:</strong> ${escapeHtml(msg)}. <code>js/config.js</code> में URL जाँचें और <code>python3 dev-server.py</code> चलाएँ।</p>`;
      main.prepend(banner);
    }
  }

  async function loadSharedWidgets() {
    if (!WP_CONFIG.USE_WORDPRESS || typeof WordPressAPI === 'undefined') return;
    try {
      const all = await WordPressAPI.fetchPosts({ per_page: 20 });
      const breaking = all.filter((p) => p.breaking);
      ALL_ARTICLES = all;
      window.ALL_ARTICLES = all;
      const breakingPosts = getBreakingPosts(breaking, all, 5);
      renderBreakingTicker(breakingPosts.length ? breakingPosts : all.slice(0, 5));
      const navCategories = await WordPressAPI.fetchNavCategories();
      const categorySections = WordPressAPI.groupByCategory(all);
      renderNavbar(categorySections, navCategories);
      startTimeRefresh();
    } catch (e) {
      console.warn('Shared widgets load failed', e);
    }
  }

  async function loadFromWordPress() {
    showLoading();
    try {
      const { data, all, breaking, categorySections, navCategories } =
        await WordPressAPI.loadAllNewsData();
      NEWS_DATA = data;
      ALL_ARTICLES = all;
      window.NEWS_DATA = NEWS_DATA;
      window.ALL_ARTICLES = ALL_ARTICLES;

      // Order matters: sections must be in DOM before we attach the
      // IntersectionObserver in initNavHighlight, otherwise dynamic
      // category links won't be observed/highlighted.
      renderNavbar(categorySections, navCategories);
      renderHomePage(all, breaking);
      renderCategorySections(categorySections, navCategories);
      initNavHighlight();
      startTimeRefresh();
      scrollToCategoryFromHash();
    } catch (err) {
      console.error(err);
      showWpError(err.message);
    }
  }

  function showArticleMessage(title, message) {
    document.title = title;
    const h1 = document.querySelector('.article-header h1');
    const metaEl = document.querySelector('.article-meta');
    const body = document.querySelector('.article-body');
    const imgWrap = document.querySelector('.article-featured-img');
    const breadcrumb = document.querySelector('.breadcrumb');
    const breakingBadge = document.querySelector('.article-header .badge-breaking');
    const catBadge = document.querySelector('.article-header .badge-category');

    if (h1) h1.textContent = title;
    if (metaEl) metaEl.innerHTML = '';
    if (breakingBadge) breakingBadge.hidden = true;
    if (catBadge) catBadge.hidden = true;
    if (imgWrap) imgWrap.hidden = true;
    if (breadcrumb) breadcrumb.innerHTML = '<a href="index.html">होम</a>';
    if (body) {
      const shareBar = body.querySelector('.share-bar');
      body.innerHTML = `<p class="loading-msg">${escapeHtml(message)}</p>${shareBar ? shareBar.outerHTML : ''}`;
    }
  }

  async function initArticlePage() {
    const container = document.querySelector('.article-page');
    if (!container) return;

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) {
      showArticleMessage('खबर नहीं मिली', 'कृपया होम पेज से कोई खबर चुनें।');
      return;
    }

    const meta = document.querySelector('.article-meta');
    if (meta) meta.innerHTML = '<span class="loading-msg" style="padding:0">लोड हो रहा है...</span>';

    try {
      let post;
      if (WP_CONFIG.USE_WORDPRESS && typeof WordPressAPI !== 'undefined') {
        post = await WordPressAPI.fetchPostById(id);
      } else {
        post = ALL_ARTICLES.find((a) => String(a.id) === id);
      }
      if (!post) {
        showArticleMessage('खबर नहीं मिली', 'यह खबर उपलब्ध नहीं है या हटा दी गई है।');
        return;
      }

      document.title = `${post.title} | CrimeKhabar`;
      const h1 = document.querySelector('.article-header h1');
      const metaEl = document.querySelector('.article-meta');
      const img = document.querySelector('.article-featured-img img');
      const imgWrap = document.querySelector('.article-featured-img');
      const body = document.querySelector('.article-body');
      const catBadge = document.querySelector('.article-header .badge-category');

      if (h1) h1.textContent = post.title;
      if (catBadge) {
        if (post.category) {
          catBadge.textContent = post.category;
          catBadge.hidden = false;
        } else {
          catBadge.hidden = true;
        }
      }
      if (metaEl) {
        metaEl.innerHTML = `${timeHtml(post)}${post.author ? `<span class="article-author">लेखक: ${escapeHtml(post.author)}</span>` : ''}`;
      }

      const breadcrumb = document.querySelector('.breadcrumb');
      if (breadcrumb) {
        const catId = resolveCategoryId({ name: post.category, slug: post.categorySlug });
        breadcrumb.innerHTML = `<a href="index.html">होम</a> / <a href="index.html#${escapeHtml(catId)}">${escapeHtml(post.category)}</a> / <span>${escapeHtml(post.title.slice(0, 40))}…</span>`;
      }

      const breakingBadge = document.querySelector('.article-header .badge-breaking');
      if (breakingBadge) breakingBadge.hidden = !post.breaking;
      if (imgWrap && img && post.image) {
        img.src = post.image.replace('w=400', 'w=900');
        img.alt = post.title;
        imgWrap.hidden = false;
      } else if (imgWrap) {
        imgWrap.hidden = true;
      }
      if (body) {
        const shareBar = body.querySelector('.share-bar');
        body.innerHTML = (post.content || '<p class="loading-msg">सामग्री उपलब्ध नहीं</p>') + (shareBar ? shareBar.outerHTML : '');
      }

      const related = document.getElementById('relatedNews');
      if (related) {
        let pool = ALL_ARTICLES;
        if (!pool.length && WP_CONFIG.USE_WORDPRESS && typeof WordPressAPI !== 'undefined') {
          pool = await WordPressAPI.fetchPosts({ per_page: 10 });
          ALL_ARTICLES = pool;
          window.ALL_ARTICLES = pool;
        }
        const relatedPosts = pool.filter((a) => a.id !== post.id).slice(0, 3);
        related.innerHTML = relatedPosts.length
          ? relatedPosts.map(createNewsCard).join('')
          : '<p class="loading-msg">संबंधित खबरें उपलब्ध नहीं</p>';
      }

      startTimeRefresh();
    } catch (err) {
      console.error('Article load failed:', err);
      showArticleMessage('लोड नहीं हो सका', 'खबर लोड करने में समस्या हुई। कृपया बाद में पुनः प्रयास करें।');
    }
  }

  async function init() {
    initSearch();
    initMobileMenu();

    if (WP_CONFIG.USE_WORDPRESS) {
      if (isHomePage()) {
        await loadFromWordPress();
        window.addEventListener('hashchange', scrollToCategoryFromHash);
      } else {
        await loadSharedWidgets();
      }
    }

    await initArticlePage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
