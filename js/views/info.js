(function () {
    'use strict';

    function findPage(slug) {
        var pages = (NC.settings && NC.settings.pages) || [];
        for (var i = 0; i < pages.length; i++) {
            if (pages[i] && String(pages[i].slug) === slug) return pages[i];
        }
        return null;
    }

    var PLATFORM_LABELS = {
        facebook: 'Facebook',
        x: 'X (Twitter)',
        instagram: 'Instagram',
        youtube: 'YouTube',
        linkedin: 'LinkedIn',
        whatsapp: 'WhatsApp',
        telegram: 'Telegram',
        website: 'Website',
        other: 'Link'
    };

    function safeHref(href) {
        href = String(href || '').trim();
        if (/^(https?:|mailto:|tel:|#|\/)/i.test(href)) return href;
        return '';
    }

    function decodeEntities(value) {
        return String(value || '')
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
            .replace(/&amp;/g, '&');
    }

    function anchorTag(href, escapedLabel) {
        var external = /^https?:/i.test(href);
        return '<a href="' + NC.ui.esc(href) + '"' +
            (external ? ' target="_blank" rel="noopener"' : '') + '>' + escapedLabel + '</a>';
    }

    function renderText(text) {
        var html = NC.ui.esc(text);

        html = html.replace(/&lt;a\s+href=&quot;([\s\S]*?)&quot;\s*&gt;([\s\S]*?)&lt;\/a&gt;/gi, function (_, href, label) {
            var u = safeHref(decodeEntities(href));
            if (!u) return _;
            return anchorTag(u, label);
        });

        html = html.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, function (_, label, url) {
            var u = safeHref(decodeEntities(url));
            if (!u) return _;
            return anchorTag(u, label);
        });

        return html;
    }

    function renderLinks(list) {
        var chips = (list || []).map(function (l) {
            var href = safeHref(l && l.href);
            if (!href) return '';
            var label = String((l && l.label) || '').trim() ||
                PLATFORM_LABELS[String((l && l.platform) || '').toLowerCase()] || 'Link';
            return '<a class="info-link-chip" href="' + NC.ui.esc(href) + '"' +
                (/^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : '') + '>' +
                NC.ui.esc(label) + '</a>';
        }).filter(Boolean).join('');
        return chips ? '<div class="info-links">' + chips + '</div>' : '';
    }

    function render(view, query, params) {
        view.dataset.page = 'info';
        var page = findPage(params.slug);

        if (!page) {
            view.innerHTML = '<div class="page">' + NC.ui.emptyState({
                icon: 'i-info',
                title: 'Page not found',
                text: 'This page is not available right now.',
                actionHref: '#/',
                actionLabel: 'Back to shop'
            }) + '</div>';
            return;
        }

        var paragraphs = String(page.body || '').split(/\n+/).filter(function (p) {
            return p.trim();
        }).map(function (p) {
            return '<p>' + renderText(p.trim()) + '</p>';
        }).join('');

        var links = renderLinks(page.links);

        view.innerHTML = '<div class="page">' +
            NC.ui.breadcrumb([
                { name: 'Home', href: '#/' },
                { name: page.title || 'Page', href: '#/info/' + NC.ui.esc(page.slug) }
            ]) +
            '<article class="info-page">' +
            '<h1 class="page-title">' + NC.ui.esc(page.title || '') + '</h1>' +
            (paragraphs || '<p>' + renderText(page.body || '') + '</p>') +
            links +
            '</article>' +
            '</div>';
    }

    NC.views = NC.views || {};
    NC.views.info = { render: render };
    NC.router.add('/info/:slug', render);
})();
