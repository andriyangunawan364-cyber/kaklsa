(() => {
  "use strict";

  const STORAGE = "vibe_feed_posts_v1";
  const LIKES = "vibe_feed_likes_v1";
  let posts = loadPosts();
  let likes = loadJSON(LIKES, {});
  let currentPostId = null;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  function loadJSON(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }

  function loadPosts() {
    const saved = loadJSON(STORAGE, []);
    return Array.isArray(saved) ? saved : [];
  }

  function savePosts() {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(posts));
    } catch {
      toast("Penyimpanan penuh. Gunakan file yang lebih kecil.");
    }
  }

  function escapeHTML(value = "") {
    return String(value)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function validMedia(url = "") {
    return url.startsWith("data:image/") || url.startsWith("data:video/");
  }

  function timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "baru saja";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} menit lalu`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} jam lalu`;
    return `${Math.floor(hours / 24)} hari lalu`;
  }

  function toast(text) {
    const el = $("#toast");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function openModal(id) {
    $("#" + id).classList.add("show");
  }

  function closeModal(id) {
    $("#" + id).classList.remove("show");
  }

  function mediaElement(post) {
    const media = validMedia(post.media) ? post.media : "";
    if (media && post.type === "video") {
      return `<video class="feed-video" src="${media}" controls loop playsinline preload="metadata"></video>`;
    }
    if (media) {
      return `<img src="${media}" alt="${escapeHTML(post.caption)}">`;
    }
    return `<div style="font-size:70px">✦</div>`;
  }

  function renderFeed() {
    const feed = $("#feed");
    const empty = $("#emptyState");
    const query = ($("#searchInput").value || "").trim().toLowerCase();

    const visible = posts.filter(post => {
      const text = `${post.username} ${post.caption}`.toLowerCase();
      return text.includes(query);
    });

    feed.innerHTML = "";
    if (!visible.length) {
      empty.classList.add("show");
      return;
    }
    empty.classList.remove("show");

    visible.forEach(post => {
      const loved = Boolean(likes[post.id]);
      const article = document.createElement("article");
      article.className = "post";
      article.dataset.id = post.id;

      article.innerHTML = `
        <div class="post-media">${mediaElement(post)}</div>
        <div class="post-overlay"></div>
        ${post.type === "video" ? `<div class="play-overlay"><div class="play-circle">▶</div></div>` : ""}
        <div class="post-info">
          <div class="user">@${escapeHTML(post.username.replace(/^@/, ""))}</div>
          <p class="caption">${escapeHTML(post.caption)}</p>
          <div class="time">${timeAgo(post.createdAt)}</div>
        </div>
        <div class="side-actions">
          <button class="action love ${loved ? "loved" : ""}" data-like="${post.id}">
            <span class="action-icon">${loved ? "♥" : "♡"}</span>
            <span>${post.likes}</span>
          </button>
          <button class="action" data-comment="${post.id}">
            <span class="action-icon">💬</span>
            <span>${post.comments.length}</span>
          </button>
          <button class="action" data-share="${post.id}">
            <span class="action-icon">↗</span>
            <span>Bagikan</span>
          </button>
        </div>
      `;
      feed.appendChild(article);
    });

    initVideoObservers();
  }

  function initVideoObservers() {
    const videos = $$(".feed-video");
    if (!videos.length) return;

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const video = entry.target;
        const post = video.closest(".post");
        if (entry.isIntersecting && entry.intersectionRatio > 0.65) {
          video.play().then(() => post.classList.remove("paused")).catch(() => post.classList.add("paused"));
        } else {
          video.pause();
        }
      });
    }, { threshold: [0.2, 0.65, 0.9] });

    videos.forEach(video => {
      observer.observe(video);
      video.addEventListener("play", () => video.closest(".post").classList.remove("paused"));
      video.addEventListener("pause", () => video.closest(".post").classList.add("paused"));
    });
  }

  function toggleLike(id) {
    const post = posts.find(p => p.id === id);
    if (!post) return;

    if (likes[id]) {
      post.likes = Math.max(0, post.likes - 1);
      delete likes[id];
      toast("Love dibatalkan");
    } else {
      post.likes += 1;
      likes[id] = true;
      toast("❤️ Love ditambahkan");
    }

    localStorage.setItem(LIKES, JSON.stringify(likes));
    savePosts();
    renderFeed();
  }

  function renderComments(id) {
    const post = posts.find(p => p.id === id);
    if (!post) return;

    currentPostId = id;
    $("#commentList").innerHTML = post.comments.length
      ? post.comments.map(c => `
          <div class="comment">
            <b>@${escapeHTML(c.user)}</b>
            <p>${escapeHTML(c.text)}</p>
          </div>`).join("")
      : `<div class="no-comment">Belum ada komentar. Jadilah yang pertama!</div>`;

    openModal("commentsModal");
  }

  function handleUpload(event) {
    event.preventDefault();

    const file = $("#mediaFile").files[0];
    if (!file) {
      toast("Pilih foto atau video.");
      return;
    }

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      toast("File harus berupa foto atau video.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast("Ukuran file maksimal 5 MB untuk mode demo.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const post = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        username: $("#username").value.trim().replace(/^@+/, ""),
        caption: $("#caption").value.trim(),
        media: reader.result,
        type: file.type.startsWith("video/") ? "video" : "photo",
        likes: 0,
        comments: [],
        createdAt: Date.now()
      };

      posts.unshift(post);
      savePosts();
      renderFeed();
      closeModal("uploadModal");
      $("#uploadForm").reset();
      $("#fileInfo").textContent = "Maksimal 5 MB untuk mode demo.";
      toast("🎉 Karya berhasil muncul di feed!");
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    reader.onerror = () => toast("File gagal dibaca.");
    reader.readAsDataURL(file);
  }

  function handleComment(event) {
    if (event.target.id !== "commentForm") return;
    event.preventDefault();

    const post = posts.find(p => p.id === currentPostId);
    if (!post) return;

    const user = $("#commentUser").value.trim().replace(/^@+/, "");
    const text = $("#commentText").value.trim();

    if (!user || !text) return;

    post.comments.push({ user, text, createdAt: Date.now() });
    savePosts();
    renderComments(post.id);
    renderFeed();
    $("#commentText").value = "";
    toast("💬 Komentar terkirim");
  }

  async function sharePost(id) {
    const post = posts.find(p => p.id === id);
    if (!post) return;

    const shareData = {
      title: `VIBE — @${post.username}`,
      text: post.caption,
      url: window.location.href
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
        toast("Link disalin");
      } else {
        toast("Bagikan link halaman ini");
      }
    } catch {
      // User canceled native share.
    }
  }

  function init() {
    renderFeed();

    $("#uploadBtn").addEventListener("click", () => openModal("uploadModal"));
    $("#emptyUpload").addEventListener("click", () => openModal("uploadModal"));
    $("#bottomUpload").addEventListener("click", () => openModal("uploadModal"));

    $("#searchBtn").addEventListener("click", () => {
      $("#searchPanel").classList.toggle("show");
      if ($("#searchPanel").classList.contains("show")) $("#searchInput").focus();
    });

    $("#searchInput").addEventListener("input", renderFeed);
    $("#uploadForm").addEventListener("submit", handleUpload);
    $("#commentForm").addEventListener("submit", handleComment);

    $("#mediaFile").addEventListener("change", () => {
      const file = $("#mediaFile").files[0];
      $("#fileInfo").textContent = file
        ? `${file.name} • ${(file.size / 1024 / 1024).toFixed(2)} MB`
        : "Maksimal 5 MB untuk mode demo.";
    });

    document.addEventListener("click", event => {
      const like = event.target.closest("[data-like]");
      if (like) toggleLike(like.dataset.like);

      const comment = event.target.closest("[data-comment]");
      if (comment) renderComments(comment.dataset.comment);

      const share = event.target.closest("[data-share]");
      if (share) sharePost(share.dataset.share);

      const close = event.target.closest("[data-close]");
      if (close) closeModal(close.dataset.close);

      if (event.target.classList.contains("modal")) {
        event.target.classList.remove("show");
      }
    });

    // Klik video untuk play/pause.
    document.addEventListener("click", event => {
      const video = event.target.closest(".feed-video");
      if (!video || event.target.closest("button")) return;
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();