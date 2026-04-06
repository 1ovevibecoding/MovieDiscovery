const API_KEY = 'db8bd0620f408b45ccb6cd8ccd2a346e';
const BASE    = 'https://api.themoviedb.org/3';
const IMG     = 'https://image.tmdb.org/t/p/w500';
const IMG_LG  = 'https://image.tmdb.org/t/p/original';
const PLACEHOLDER = 'https://placehold.co/400x600/1a1a1f/636366?text=No+Poster';

let popularMovies = [];
let displayMovies = [];
let genreMap      = {};
let activeGenres  = new Set();
let searchTerm    = '';

const $grid         = document.getElementById('movie-grid');
const $noResults    = document.getElementById('no-results');
const $search       = document.getElementById('search-input');
const $genres       = document.getElementById('genre-filters');
const $themeBtn     = document.getElementById('theme-btn');
const $modal        = document.getElementById('movie-modal');
const $modalBody    = document.getElementById('modal-body');
const $closeModal   = document.getElementById('close-modal');
const $sectionTitle = document.getElementById('section-title');
const $movieCount   = document.getElementById('movie-count');
const $clearFilters = document.getElementById('clear-filters');

async function tmdbFetch(endpoint) {
    const sep = endpoint.includes('?') ? '&' : '?';
    const res = await fetch(`${BASE}${endpoint}${sep}api_key=${API_KEY}&language=vi-VN`);
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
}

async function fetchGenres() {
    const data = await tmdbFetch('/genre/movie/list');
    data.genres.forEach(g => { genreMap[g.id] = g.name; });
}

async function fetchPopularMovies() {
    const pages = await Promise.all(
        [1, 2, 3, 4, 5].map(p => tmdbFetch(`/movie/popular?page=${p}`))
    );
    const seen = new Set();
    const all = [];
    pages.flatMap(p => p.results).forEach(m => {
        if (!seen.has(m.id)) {
            seen.add(m.id);
            all.push(m);
        }
    });
    popularMovies = all.slice(0, 100);
    displayMovies = popularMovies;
}

async function searchMovies(query) {
    const [p1, p2] = await Promise.all([
        tmdbFetch(`/search/movie?query=${encodeURIComponent(query)}&page=1`),
        tmdbFetch(`/search/movie?query=${encodeURIComponent(query)}&page=2`)
    ]);
    return [...(p1.results || []), ...(p2.results || [])];
}

async function fetchDetails(id) {
    return tmdbFetch(`/movie/${id}?append_to_response=credits`);
}

function showSkeletons(count = 15) {
    $grid.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const el = document.createElement('div');
        el.className = 'skeleton-card';
        el.innerHTML = `
            <div class="skeleton-poster"></div>
            <div class="skeleton-info">
                <div class="skeleton-line"></div>
                <div class="skeleton-line short"></div>
            </div>`;
        $grid.appendChild(el);
    }
}

function renderGenres() {
    $genres.innerHTML = '';
    const usedIds = new Set();
    popularMovies.forEach(m => (m.genre_ids || []).forEach(id => usedIds.add(id)));

    const sorted = Array.from(usedIds)
        .filter(id => genreMap[id])
        .sort((a, b) => genreMap[a].localeCompare(genreMap[b]));

    sorted.forEach(id => {
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = id;

        cb.addEventListener('change', () => {
            cb.checked ? activeGenres.add(id) : activeGenres.delete(id);
            $clearFilters.classList.toggle('hidden', activeGenres.size === 0);
            applyFilters();
        });

        label.append(cb, ` ${genreMap[id]}`);
        $genres.appendChild(label);
    });
}

$clearFilters.addEventListener('click', () => {
    activeGenres.clear();
    $genres.querySelectorAll('input').forEach(cb => { cb.checked = false; });
    $clearFilters.classList.add('hidden');
    applyFilters();
});

function renderMovies(movies) {
    $grid.innerHTML = '';

    if (movies.length === 0) {
        $grid.classList.add('hidden');
        $noResults.classList.remove('hidden');
        $movieCount.textContent = '';
        return;
    }

    $grid.classList.remove('hidden');
    $noResults.classList.add('hidden');
    $movieCount.textContent = `${movies.length} phim`;

    const frag = document.createDocumentFragment();

    movies.forEach(movie => {
        const card = document.createElement('div');
        card.className = 'movie-card';

        const rating = movie.vote_average?.toFixed(1) || '—';
        const year   = movie.release_date?.substring(0, 4) || '—';
        const poster = movie.poster_path ? `${IMG}${movie.poster_path}` : PLACEHOLDER;
        const isHot  = movie.vote_average >= 8.0;

        card.innerHTML = `
            <div class="card-poster-wrap">
                <img src="${poster}" alt="${movie.title}" class="card-poster" loading="lazy"
                     onerror="this.src='${PLACEHOLDER}'">
                <span class="card-rating">⭐ ${rating}</span>
                ${isHot ? '<span class="badge-hot">🔥 Hot</span>' : ''}
            </div>
            <div class="card-info">
                <h3 class="card-title">${movie.title}</h3>
                <span class="card-year">${year}</span>
            </div>`;

        card.addEventListener('click', () => openModal(movie.id));
        frag.appendChild(card);
    });

    $grid.appendChild(frag);
}

function applyFilters() {
    let list = displayMovies;

    if (activeGenres.size > 0) {
        list = list.filter(m =>
            (m.genre_ids || []).some(id => activeGenres.has(id))
        );
    }

    renderMovies(list);
}

function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

$search.addEventListener('input', debounce(async (e) => {
    const q = e.target.value.trim();
    searchTerm = q;

    if (!q) {
        displayMovies = popularMovies;
        $sectionTitle.textContent = 'Phim phổ biến';
        applyFilters();
        return;
    }

    $sectionTitle.textContent = `Kết quả: "${q}"`;
    showSkeletons(8);

    const results = await searchMovies(q);
    displayMovies = results;
    applyFilters();
}, 400));

async function openModal(movieId) {
    $modalBody.innerHTML = '<div class="modal-loading">Đang tải thông tin phim...</div>';
    $modal.classList.add('show');
    document.body.style.overflow = 'hidden';

    try {
        const m = await fetchDetails(movieId);

        const directors = m.credits?.crew
            ?.filter(c => c.job === 'Director')
            .map(c => c.name).join(', ') || 'Không rõ';

        const cast = m.credits?.cast
            ?.slice(0, 5)
            .map(c => c.name).join(', ') || 'Không rõ';

        const genres = (m.genres || []).map(g => `<span>${g.name}</span>`).join('');
        const year   = m.release_date?.substring(0, 4) || '—';
        const rating = m.vote_average?.toFixed(1) || '—';
        const desc   = m.overview || 'Chưa có mô tả cho phim này.';
        const poster = m.poster_path ? `${IMG_LG}${m.poster_path}` : PLACEHOLDER;

        $modalBody.innerHTML = `
            <img src="${poster}" alt="${m.title}" class="modal-poster"
                 onerror="this.src='${PLACEHOLDER}'">
            <div class="modal-info">
                <h2 class="modal-title">${m.title}</h2>
                <div class="modal-meta">
                    <span>📅 ${year}</span>
                    <span class="rating-badge">⭐ ${rating} / 10</span>
                </div>
                <div class="modal-genres">${genres}</div>
                <p class="modal-desc">${desc}</p>
                <div class="modal-credits">
                    <p><strong>Đạo diễn:</strong> ${directors}</p>
                    <p><strong>Diễn viên:</strong> ${cast}</p>
                </div>
            </div>`;
    } catch {
        $modalBody.innerHTML = '<div class="modal-loading">Lỗi khi tải dữ liệu 😔</div>';
    }
}

function closeModal() {
    $modal.classList.remove('show');
    document.body.style.overflow = '';
}

$closeModal.addEventListener('click', closeModal);
$modal.addEventListener('click', (e) => { if (e.target === $modal) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

function initTheme() {
    const saved = localStorage.getItem('theme') ||
        (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', saved);

    $themeBtn.addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    });
}

async function initApp() {
    initTheme();
    showSkeletons();
    await Promise.all([fetchGenres(), fetchPopularMovies()]);
    renderGenres();
    renderMovies(displayMovies);
}

document.addEventListener('DOMContentLoaded', initApp);