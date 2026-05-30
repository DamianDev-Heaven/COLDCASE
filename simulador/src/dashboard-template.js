function renderDashboardPage() {
	return String.raw`<!doctype html>
<html lang="es">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Simulador maestro</title>
	<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
	<style>
		@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');

		:root {
			color-scheme: dark;
			--bg: #000000;
			--panel: #09090b;
			--panel-2: #050505;
			--line: rgba(255, 255, 255, 0.08);
			--text: #ededed;
			--muted: #71717a;
			--cyan: #06b6d4;
			--emerald: #10b981;
			--amber: #f59e0b;
			--rose: #f43f5e;
			--indigo: #6366f1;
		}

		* { box-sizing: border-box; }
		
		/* Custom scrollbar styles */
		::-webkit-scrollbar {
			width: 6px;
			height: 6px;
		}
		::-webkit-scrollbar-track {
			background: transparent;
		}
		::-webkit-scrollbar-thumb {
			background: rgba(255, 255, 255, 0.1);
			border-radius: 9999px;
			transition: background-color 0.2s ease;
		}
		::-webkit-scrollbar-thumb:hover {
			background: rgba(255, 255, 255, 0.2);
		}

		body {
			margin: 0;
			height: 100vh;
			background-color: var(--bg);
			background-image: 
				radial-gradient(ellipse 80% 50% at 50% -20%, rgba(255, 255, 255, 0.05), transparent),
				radial-gradient(ellipse 60% 40% at 80% 100%, rgba(255, 255, 255, 0.01), transparent),
				var(--bg);
			background-size: 100% 100%, 100% 100%;
			color: var(--text);
			font-family: 'Inter', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
			overflow: hidden;
			letter-spacing: -0.019em;
			position: relative;
		}

		body::before {
			content: "";
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			height: 600px;
			background-image: 
				linear-gradient(to right, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
				linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
			background-size: 32px 32px;
			mask-image: radial-gradient(ellipse 50% 50% at 50% 0%, black, transparent);
			-webkit-mask-image: radial-gradient(ellipse 50% 50% at 50% 0%, black, transparent);
			pointer-events: none;
			z-index: 0;
		}

		/* LED glow animation for active/inactive state */
		@keyframes led-glow-green {
			0% { box-shadow: 0 0 4px rgba(16, 185, 129, 0.4); opacity: 0.8; }
			50% { box-shadow: 0 0 12px rgba(16, 185, 129, 0.9); opacity: 1; }
			100% { box-shadow: 0 0 4px rgba(16, 185, 129, 0.4); opacity: 0.8; }
		}
		@keyframes led-glow-amber {
			0% { box-shadow: 0 0 4px rgba(245, 158, 11, 0.4); opacity: 0.8; }
			50% { box-shadow: 0 0 12px rgba(245, 158, 11, 0.9); opacity: 1; }
			100% { box-shadow: 0 0 4px rgba(245, 158, 11, 0.4); opacity: 0.8; }
		}
		.led-indicator {
			display: inline-block;
			width: 8px;
			height: 8px;
			border-radius: 50%;
			margin-right: 8px;
			vertical-align: middle;
		}
		.led-indicator.active {
			background: var(--emerald);
			animation: led-glow-green 2s infinite;
		}
		.led-indicator.paused {
			background: var(--amber);
			animation: led-glow-amber 2s infinite;
		}

		/* AI Diagnostic card styles */
		.ia-diagnosis-card {
			margin-top: 10px;
			padding: 12px 14px;
			background: rgba(9, 9, 11, 0.9);
			border: 1px solid rgba(16, 185, 129, 0.15);
			border-left: 3px solid var(--emerald);
			border-radius: 8px;
			color: #ededed;
			font-size: 12px;
			line-height: 1.5;
			position: relative;
			overflow: hidden;
		}
		.ia-diagnosis-header {
			font-size: 10px;
			font-weight: 800;
			letter-spacing: 0.08em;
			text-transform: uppercase;
			color: #a7f3d0;
			margin-bottom: 6px;
			border-bottom: 1px solid rgba(16, 185, 129, 0.1);
			padding-bottom: 4px;
		}
		.ia-diagnosis-body {
			font-family: inherit;
			font-weight: 400;
			color: #e2e8f0;
			white-space: pre-wrap;
			word-wrap: break-word;
		}

		.topbar {
			height: 64px;
			background: rgba(9, 9, 11, 0.85);
			border-bottom: 1px solid rgba(255, 255, 255, 0.08);
			backdrop-filter: blur(16px);
			z-index: 30;
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 0 24px;
			transition: all 0.2s ease;
		}

		.shell {
			width: 100%;
			max-width: 1750px;
			margin: 0 auto;
			padding: 16px;
			display: grid;
			grid-template-columns: 340px minmax(0, 1fr) 400px;
			gap: 16px;
			height: calc(100vh - 64px);
			overflow: hidden;
		}

		.sidebar {
			display: flex;
			flex-direction: column;
			gap: 12px;
			height: 100%;
			min-height: 0;
		}

		.workspace-main {
			display: flex;
			flex-direction: column;
			gap: 12px;
			height: 100%;
			min-width: 0;
			min-height: 0;
		}

		.workspace-ai {
			display: flex;
			flex-direction: column;
			gap: 12px;
			height: 100%;
			min-height: 0;
		}

		.panel,
		.card,
		.stack-item {
			background: rgba(9, 9, 11, 0.75);
			border: 1px solid rgba(255, 255, 255, 0.08);
			border-radius: 16px;
			box-shadow: 0 10px 30px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.02);
			backdrop-filter: blur(12px);
			transition: border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		}

		.panel:hover,
		.card:hover {
			border-color: rgba(255, 255, 255, 0.16);
			background-color: rgba(14, 14, 17, 0.95);
			box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.7);
		}

		.panel { padding: 16px; min-height: 0; }
		
		.stack { 
			overflow-y: auto; 
			padding-right: 4px;
			display: flex;
			flex-direction: column;
			gap: 8px;
			min-height: 0;
			flex: 1;
			overscroll-behavior: contain; 
		}
		
		.stack-item {
			padding: 12px;
			cursor: pointer;
			background: rgba(0, 0, 0, 0.4);
			border: 1px solid rgba(255, 255, 255, 0.06);
			position: relative;
			border-radius: 12px;
			transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
		}
		.stack-item:hover {
			border-color: rgba(255, 255, 255, 0.16);
			background: rgba(14, 14, 17, 0.8);
			transform: translateY(-1px);
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
		}
		.stack-item.active {
			border-color: var(--cyan);
			background: linear-gradient(90deg, rgba(6, 182, 212, 0.08) 0%, rgba(9, 9, 11, 0.8) 100%);
			box-shadow: 0 0 20px rgba(6, 182, 212, 0.05);
		}

		.eyebrow {
			text-transform: uppercase;
			letter-spacing: 0.16em;
			font-size: 9px;
			font-weight: 700;
			background: linear-gradient(to right, #ffffff, #a1a1aa);
			-webkit-background-clip: text;
			-webkit-text-fill-color: transparent;
			display: inline-block;
		}

		.text-gradient {
			background: linear-gradient(to right, #ffffff, #a1a1aa);
			-webkit-background-clip: text;
			-webkit-text-fill-color: transparent;
			display: inline-block;
		}

		.title {
			margin: 4px 0 0;
			font-size: 1.5rem;
			font-weight: 800;
			letter-spacing: -0.03em;
			background: linear-gradient(to right, #ffffff, #a1a1aa);
			-webkit-background-clip: text;
			-webkit-text-fill-color: transparent;
		}

		.muted { color: var(--muted); }

		.controls, .stat-grid {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 8px;
			margin-top: 12px;
		}

		.btn {
			border: 1px solid rgba(255, 255, 255, 0.1);
			background: #000000;
			color: #ededed;
			border-radius: 10px;
			padding: 8px 14px;
			font-weight: 600;
			cursor: pointer;
			transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: 8px;
			font-size: 11px;
			text-transform: uppercase;
			letter-spacing: 0.05em;
		}
		.btn:hover {
			border-color: rgba(255, 255, 255, 0.24);
			background: rgba(255, 255, 255, 0.06);
			color: #ffffff;
			box-shadow: 0 4px 15px rgba(255, 255, 255, 0.04);
		}
		.btn:active {
			transform: translateY(1px);
		}
		.btn.primary {
			background: #ffffff;
			border-color: #ffffff;
			color: #000000;
		}
		.btn.primary:hover {
			background: #e2e8f0;
			border-color: #e2e8f0;
			color: #000000;
			box-shadow: 0 4px 20px rgba(255, 255, 255, 0.15);
		}
		.btn.warn {
			background: rgba(244, 63, 94, 0.15);
			border-color: rgba(244, 63, 94, 0.35);
			color: #fca5a5;
		}
		.btn.warn:hover {
			background: rgba(244, 63, 94, 0.25);
			border-color: #f43f5e;
			box-shadow: 0 4px 15px rgba(244, 63, 94, 0.15);
		}

		.tag {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			border-radius: 99px;
			padding: 4px 10px;
			font-size: 10px;
			font-weight: 800;
			border: 1px solid rgba(255, 255, 255, 0.08);
			background: rgba(9, 9, 11, 0.85);
			text-transform: uppercase;
			letter-spacing: 0.05em;
		}

		.tag.activo { color: #86efac; border-color: rgba(16, 185, 129, 0.2); background: rgba(16, 185, 129, 0.05); }
		.tag.alerta { color: #fef08a; border-color: rgba(245, 158, 11, 0.2); background: rgba(245, 158, 11, 0.05); }
		.tag.error { color: #fca5a5; border-color: rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.05); }
		.tag.pausado { color: #cbd5e1; border-color: rgba(148, 163, 184, 0.2); background: rgba(148, 163, 184, 0.05); }
		.tag.osrm { color: #38bdf8; border-color: rgba(6, 182, 212, 0.2); background: rgba(6, 182, 212, 0.05); }

		.card {
			padding: 16px;
			display: grid;
			gap: 12px;
			min-height: 0;
		}

		.metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
		.metric {
			padding: 12px;
			border-radius: 12px;
			background: rgba(0, 0, 0, 0.4);
			border: 1px solid rgba(255, 255, 255, 0.04);
			transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		}
		.metric:hover {
			border-color: rgba(255, 255, 255, 0.08);
			background: rgba(0, 0, 0, 0.6);
		}
		.metric span { display: block; font-size: 8px; text-transform: uppercase; letter-spacing: 0.16em; color: var(--muted); font-weight: 700; }
		.metric strong {
			display: block;
			margin-top: 4px;
			font-size: 1.35rem;
			font-family: monospace;
			font-weight: 700;
			background: linear-gradient(135deg, #ffffff 0%, #a1a1aa 100%);
			-webkit-background-clip: text;
			-webkit-text-fill-color: transparent;
		}

		.tab-nav-container, .ai-tab-nav-container {
			display: flex;
			background: rgba(255, 255, 255, 0.03);
			border: 1px solid rgba(255, 255, 255, 0.06);
			border-radius: 12px;
			padding: 3px;
			margin-bottom: 12px;
			width: 100%;
			flex-shrink: 0;
		}
		.tab-nav-btn, .ai-tab-nav-btn {
			flex: 1;
			padding: 8px 12px;
			background: transparent;
			border: none;
			border-radius: 9px;
			color: var(--muted);
			font-size: 11px;
			font-weight: 600;
			cursor: pointer;
			text-transform: uppercase;
			letter-spacing: 0.05em;
			transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		}
		.tab-nav-btn.active, .ai-tab-nav-btn.active {
			background: rgba(255, 255, 255, 0.08);
			color: #ffffff !important;
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
			border-bottom: none !important;
		}
		.tab-nav-btn:hover, .ai-tab-nav-btn:hover {
			color: #ffffff !important;
			background: rgba(255, 255, 255, 0.03);
		}

		.map-card, .chart-card, .feed-card {
			overflow: hidden;
			background: rgba(9, 9, 11, 0.75);
			border: 1px solid rgba(255, 255, 255, 0.08);
			border-radius: 16px;
			box-shadow: 0 10px 30px rgba(0, 0, 0, 0.65);
			display: flex;
			flex-direction: column;
			min-height: 0;
			transition: border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		}
		.map-card:hover, .chart-card:hover, .feed-card:hover {
			border-color: rgba(255, 255, 255, 0.16);
			background-color: rgba(14, 14, 17, 0.95);
			box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.7);
		}

		.map-card {
			padding: 14px;
			flex-grow: 1;
			display: flex;
			flex-direction: column;
			min-height: 280px; /* Evita colapsos a 0 */
			position: relative;
		}
		.chart-card {
			padding: 14px;
			shrink: 0;
			height: 250px;
			display: flex;
			flex-direction: column;
			position: relative;
		}
		.feed-card {
			padding: 14px;
			flex-grow: 1;
			display: flex;
			flex-direction: column;
			min-height: 220px;
		}
		
		.chart-wrap {
			overflow-x: auto;
			overflow-y: hidden;
			min-height: 0;
			flex: 1;
			position: relative;
			background: #000000;
			border-radius: 12px;
			border: 1px solid rgba(255, 255, 255, 0.04);
			overscroll-behavior: contain;
			display: block;
		}
		.chart-scroll {
			height: 100%;
			display: block;
		}

		.map-wrap {
			flex: 1;
			min-height: 0;
			position: relative;
			display: flex;
			flex-direction: column;
		}
		.map-shell {
			position: relative;
			flex: 1;
			width: 100%;
			border-radius: 12px;
			overflow: hidden;
			background: #000000;
			border: 1px solid rgba(255, 255, 255, 0.04);
		}
		
		/* Custom Dark mode filter for Leaflet map */
		.leaflet-map {
			position: absolute;
			inset: 0;
			width: 100%;
			height: 100%;
		}
		.leaflet-container {
			filter: invert(96%) hue-rotate(185deg) brightness(85%) contrast(100%);
			background: #000000 !important;
		}
		.leaflet-tile-container {
			opacity: 0.85;
		}
		.leaflet-bar {
			border: none !important;
			box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4) !important;
		}
		.leaflet-bar a {
			background-color: #09090b !important;
			border: 1px solid rgba(255, 255, 255, 0.06) !important;
			color: #94a3b8 !important;
			transition: all 0.2s ease;
		}
		.leaflet-bar a:hover {
			background-color: rgba(14, 165, 233, 0.15) !important;
			color: #38bdf8 !important;
			border-color: rgba(14, 165, 233, 0.3) !important;
		}

		.map-hud {
			position: absolute;
			top: 10px;
			left: 10px;
			right: 10px;
			z-index: 500;
			display: flex;
			justify-content: space-between;
			gap: 8px;
			pointer-events: none;
		}
		.map-hud .tag { pointer-events: auto; backdrop-filter: blur(10px); }
		
		.map-banner {
			position: absolute;
			left: 10px;
			bottom: 10px;
			z-index: 500;
			max-width: min(480px, calc(100% - 20px));
			padding: 8px 12px;
			border-radius: 10px;
			border: 1px solid rgba(255, 255, 255, 0.06);
			background: rgba(9, 9, 11, 0.85);
			backdrop-filter: blur(10px);
			font-size: 11px;
			color: var(--text);
		}
		.map-legend {
			position: absolute;
			right: 10px;
			bottom: 10px;
			z-index: 500;
			display: grid;
			gap: 4px;
			padding: 8px 12px;
			border-radius: 10px;
			border: 1px solid rgba(255, 255, 255, 0.06);
			background: rgba(9, 9, 11, 0.85);
			backdrop-filter: blur(10px);
			font-size: 11px;
			color: var(--text);
			max-width: min(220px, calc(100% - 20px));
		}
		.legend-row {
			display: flex;
			align-items: center;
			gap: 8px;
			white-space: nowrap;
		}
		.legend-dot {
			width: 8px;
			height: 8px;
			border-radius: 50%;
			flex: 0 0 auto;
		}
		.legend-dot.route { background: #7dd3fc; }
		.legend-dot.temp { background: #ef4444; }
		.legend-dot.battery { background: #f59e0b; }
		.legend-dot.current { background: #4cc9f0; }
		
		.map-fallback {
			position: absolute;
			inset: 0;
			display: flex;
			align-items: center;
			justify-content: center;
			text-align: center;
			padding: 18px;
			color: var(--muted);
			background: rgba(0, 0, 0, 0.85);
			z-index: 450;
		}

		.feed-list {
			overflow-y: auto;
			display: flex;
			flex-direction: column;
			gap: 8px;
			flex: 1;
			min-height: 0;
			overscroll-behavior: contain;
		}
		.feed-item {
			padding: 12px;
			border-radius: 12px;
			background: rgba(9, 9, 11, 0.4);
			border: 1px solid rgba(255, 255, 255, 0.04);
			transition: all 0.2s ease;
		}
		.feed-item:hover {
			border-color: rgba(255, 255, 255, 0.08);
			background: rgba(9, 9, 11, 0.65);
		}
		.feed-item strong { display: block; font-size: 12px; color: #fff; }
		.feed-item small { display: block; margin-top: 4px; color: var(--muted); font-size: 10px; }

		.empty {
			padding: 20px;
			border-radius: 12px;
			border: 1px dashed rgba(255, 255, 255, 0.06);
			color: var(--muted);
			background: rgba(9, 9, 11, 0.3);
			text-align: center;
			font-size: 11px;
			font-family: inherit;
			height: 100%;
			display: flex;
			align-items: center;
			justify-content: center;
		}

		/* Premium custom styled switches */
		.switch {
			position: relative;
			display: inline-block;
			width: 42px;
			height: 22px;
			flex: 0 0 auto;
		}
		.switch input {
			opacity: 0;
			width: 0;
			height: 0;
		}
		.slider {
			position: absolute;
			cursor: pointer;
			inset: 0;
			background-color: rgba(255, 255, 255, 0.06);
			transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
			border-radius: 99px;
			border: 1px solid rgba(255, 255, 255, 0.04);
		}
		.slider:before {
			position: absolute;
			content: "";
			height: 14px;
			width: 14px;
			left: 3px;
			bottom: 3px;
			background-color: #64748b;
			transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
			border-radius: 50%;
			box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
		}
		.switch input:checked + .slider {
			background-color: rgba(14, 165, 233, 0.2);
			border-color: rgba(14, 165, 233, 0.4);
		}
		.switch input:checked + .slider:before {
			transform: translateX(20px);
			background-color: var(--cyan);
			box-shadow: 0 0 8px rgba(14, 165, 233, 0.6);
		}
		
		/* Danger state slider for failures and signal loss */
		.switch.danger input:checked + .slider {
			background-color: rgba(239, 68, 68, 0.25);
			border-color: rgba(239, 68, 68, 0.5);
		}
		.switch.danger input:checked + .slider:before {
			background-color: #ef4444;
			box-shadow: 0 0 10px rgba(239, 68, 68, 0.8);
		}

		/* Warning state slider for offline queue worker */
		.switch.warning input + .slider {
			background-color: rgba(245, 158, 11, 0.15);
			border-color: rgba(245, 158, 11, 0.3);
		}
		.switch.warning input + .slider:before {
			background-color: #f59e0b;
			box-shadow: 0 0 8px rgba(245, 158, 11, 0.6);
		}
		.switch.warning input:checked + .slider {
			background-color: rgba(16, 185, 129, 0.2);
			border-color: rgba(16, 185, 129, 0.4);
		}
		.switch.warning input:checked + .slider:before {
			background-color: var(--emerald);
			box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);
		}

		@media (max-width: 1400px) {
			.shell { grid-template-columns: 300px minmax(0, 1fr) 350px; gap: 12px; }
		}

		@media (max-width: 1120px) {
			body { overflow: auto; height: auto; }
			.shell { grid-template-columns: 1fr; height: auto; overflow: visible; }
			.sidebar, .workspace-main, .workspace-ai { height: auto; }
			.map-card { height: 400px; }
			.feed-card { height: 440px; }
		}

		/* Adaptabilidad para pantallas de poca altura (Vertical Media Queries) */
		@media (max-height: 800px) {
			body { overflow: auto; height: auto; }
			.shell { height: auto; overflow: visible; grid-template-columns: 340px minmax(0, 1fr) 400px; }
			@media (max-width: 1120px) {
				.shell { grid-template-columns: 1fr; }
			}
			.sidebar, .workspace-main, .workspace-ai { height: auto; }
			.map-card { height: 360px; }
			.feed-card { height: 400px; }
		}

		/* Adaptabilidad para pantallas extremadamente estrechas o móviles */
		@media (max-width: 768px) {
			.topbar {
				height: auto;
				padding: 12px 16px;
				flex-direction: column;
				gap: 12px;
				align-items: flex-start;
			}
			.topbar > div {
				width: 100%;
			}
			.topbar button {
				padding: 6px 10px;
				font-size: 10px;
			}
		}
		.topbar-brand {
			display: flex;
			align-items: center;
			gap: 8px;
		}
		.topbar-logo-text {
			font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
			font-weight: 800;
			font-size: 13px;
			letter-spacing: 0.04em;
			background: linear-gradient(to right, #ffffff, #a1a1aa);
			-webkit-background-clip: text;
			-webkit-text-fill-color: transparent;
			text-transform: uppercase;
		}
		.topbar-badge {
			font-family: monospace;
			font-size: 9px;
			font-weight: 800;
			color: var(--cyan);
			border: 1px solid rgba(6, 182, 212, 0.2);
			background: rgba(6, 182, 212, 0.06);
			padding: 2px 6px;
			border-radius: 6px;
			letter-spacing: 0.05em;
		}
		.topbar-status {
			display: flex;
			align-items: center;
			font-size: 10px;
			font-weight: 600;
			margin-top: 4px;
			color: var(--muted);
			letter-spacing: -0.01em;
		}
	</style>
</head>
<body>
	<header class="topbar">
		<div>
			<div class="topbar-brand">
				<span class="topbar-logo-text">Consola de Operaciones</span>
				<span class="topbar-badge">SIMULADOR IOT</span>
			</div>
			<div id="connectionState" class="topbar-status">
				<span class="led-indicator active" id="ledStatus"></span>
				<span id="connectionText">Conectando con backend...</span>
			</div>
		</div>
		<div style="display: flex; gap: 8px; align-items: center;">
			<button id="toggleBtn" class="btn primary">Pausar</button>
			<button id="stepBtn" class="btn">Forzar ciclo</button>
			<button id="openDashboardBtn" class="btn warn">Ir al Dashboard</button>
		</div>
	</header>

	<div class="shell">
		<!-- COLUMNA 1: CONTROL DE WORKER & LISTADO DE VIAJES (IZQUIERDA) -->
		<aside class="sidebar" style="display: flex; flex-direction: column; gap: 12px; height: 100%;">
			<div class="tab-nav-container">
				<button class="tab-nav-btn active" onclick="switchSidebarTab('tab-trips')">Viajes</button>
				<button class="tab-nav-btn" onclick="switchSidebarTab('tab-resilience')">Fallas & Worker</button>
			</div>

			<!-- CONTENIDO DE PESTAÑA: VIAJES -->
			<div id="tab-trips" class="tab-content" style="display: flex; flex-direction: column; gap: 12px; flex: 1; min-height: 0;">
				<div class="panel" style="shrink: 0; padding: 12px;">
					<div class="eyebrow" style="margin-bottom: 2px;">Resumen de Control</div>
					<div class="stat-grid" style="grid-template-columns: repeat(2, 1fr); gap: 6px; margin-top: 4px;">
						<div class="metric" style="padding: 6px 8px;"><span style="font-size: 8px;">Sims Activas</span><strong id="activeTrips" style="font-size: 1.05rem; margin-top: 2px;">0</strong></div>
						<div class="metric" style="padding: 6px 8px;"><span style="font-size: 8px;">Total Ticks</span><strong id="sentTrips" style="font-size: 1.05rem; margin-top: 2px;">0</strong></div>
						<div class="metric" style="padding: 6px 8px;"><span style="font-size: 8px;">Anomalías</span><strong id="incidentTrips" style="font-size: 1.05rem; margin-top: 2px;">0</strong></div>
						<div class="metric" style="padding: 6px 8px;"><span style="font-size: 8px;">Última Sync</span><strong id="lastSync" style="font-size: 8px; font-family: monospace; margin-top: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">-</strong></div>
					</div>
				</div>
				<div class="panel" style="flex: 1; display: flex; flex-direction: column; min-height: 0; padding-bottom: 12px;">
					<div class="eyebrow" style="margin-bottom: 4px;">Monitoreo de Flota</div>
					<span style="font-size: 10px; color: var(--muted); display: block; margin-bottom: 8px;">Selecciona una ruta en curso para auditar</span>
					<div class="stack" id="tripList"></div>
				</div>
			</div>

			<!-- CONTENIDO DE PESTAÑA: FALLAS & INFRAESTRUCTURA -->
			<div id="tab-resilience" class="tab-content" style="display: none; flex-direction: column; gap: 12px;">
				<div class="panel">
					<div class="eyebrow" style="margin-bottom: 2px;">Simulación Global</div>
					<h1 class="title" style="font-size: 1.15rem; margin-bottom: 8px;">Consola de Worker</h1>
					
					<!-- Global Simulation Speed / Turbo Control -->
					<div style="margin-top: 10px; padding: 10px 12px; border-radius: 10px; background: rgba(9, 9, 11, 0.45); border: 1px solid rgba(255, 255, 255, 0.04); display: flex; align-items: center; justify-content: space-between; gap: 10px;">
						<div>
							<div style="font-size: 11px; font-weight: 700; color: #e2e8f0;">Avance Rápido (Modo Turbo)</div>
							<div style="font-size: 9px; color: var(--muted); margin-top: 1px;">Ticks de 2s y saltos de tramo</div>
						</div>
						<label class="switch">
							<input type="checkbox" id="turboToggle">
							<span class="slider"></span>
						</label>
					</div>
				</div>
				
				<div class="panel" style="background: rgba(9, 9, 11, 0.4);">
					<div class="eyebrow" style="margin-bottom: 2px;">Resiliencia & Red</div>
					<h2 class="title" style="font-size: 1rem; margin-bottom: 8px;">Control de Infraestructura</h2>
					
					<!-- Fallo IoT Toggle -->
					<div style="padding: 10px 12px; border-radius: 10px; background: rgba(9, 9, 11, 0.45); border: 1px solid rgba(255, 255, 255, 0.04); display: flex; align-items: center; justify-content: space-between; gap: 10px;">
						<div>
							<div style="font-size: 11px; font-weight: 700; color: #e2e8f0;">Falla de Señal IoT</div>
							<div style="font-size: 9px; color: var(--muted); margin-top: 1px;">Simula desconexión celular del camión</div>
							<div id="iotFailureStatusText" style="font-size: 9px; color: var(--muted); margin-top: 4px; font-family: monospace;">Estado: normal</div>
						</div>
						<label class="switch danger">
							<input type="checkbox" id="iotFailureToggle">
							<span class="slider"></span>
						</label>
					</div>
					
					<!-- Worker Cola IA Toggle -->
					<div style="margin-top: 6px; padding: 10px 12px; border-radius: 10px; background: rgba(9, 9, 11, 0.45); border: 1px solid rgba(255, 255, 255, 0.04); display: flex; align-items: center; justify-content: space-between; gap: 10px;">
						<div>
							<div style="font-size: 11px; font-weight: 700; color: #e2e8f0;">Worker de Diagnóstico IA</div>
							<div style="font-size: 9px; color: var(--muted); margin-top: 1px; display: flex; align-items: center; gap: 4px;">
								<span class="led-indicator" id="workerLed" style="width:6px; height:6px; margin-right:4px;"></span>
								<span id="workerStatusText">Cargando...</span>
							</div>
							<div id="workerQueueDetail" style="font-size: 9px; color: var(--muted); margin-top: 4px; font-family: monospace;">Cola: -</div>
						</div>
						<label class="switch warning">
							<input type="checkbox" id="queueToggle" checked>
							<span class="slider"></span>
						</label>
					</div>
				</div>
			</div>
		</aside>

		<!-- COLUMNA 2: GEOMETRÍA Y TERMODINÁMICA (CENTRAL - FLEX-1) -->
		<section class="workspace-main">
			<!-- Banner de Viaje Seleccionado -->
			<section class="card" style="padding:14px; shrink: 0;">
				<div style="display:flex; justify-content:space-between; gap:12px; align-items:center; flex-wrap:wrap;">
					<div style="min-width: 0; flex: 1;">
						<div class="eyebrow" style="letter-spacing:0.2em; font-size: 9px;">Geometría & Ruta en Tiempo Real</div>
						<h2 class="title" style="font-size:1.15rem; margin:4px 0 0; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" id="selectedTitle">Sin viaje seleccionado</h2>
						<p class="muted" id="selectedSubtitle" style="margin:4px 0 0; font-size:11px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">La telemetría aparecerá aquí al seleccionar un viaje activo.</p>
					</div>
					<div style="display:flex; gap:6px; flex-shrink: 0;">
						<span class="tag" id="stateTag">activo</span>
					</div>
				</div>
			</section>

			<!-- Mapa OSRM Leaflet -->
			<section class="map-card">
				<div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:8px;">
					<div>
						<div class="eyebrow" style="font-size: 9px;">Mapa de Ruta Activa</div>
						<div class="muted" style="font-size:10px;">Posicionamiento OSRM y avance en tiempo real</div>
					</div>
					<div class="tag" id="routeSourceTag" style="font-size: 9px;">fallback</div>
				</div>
				<div class="map-wrap" id="mapWrap">
					<div class="empty">Selecciona un viaje para ver la ruta interactiva.</div>
				</div>
			</section>

			<!-- Gráfica Térmica -->
			<section class="chart-card">
				<div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:8px;">
					<div>
						<div class="eyebrow" style="font-size: 9px;">Historial Térmico de Sensor</div>
						<div class="muted" style="font-size:10px;">Curva del sensor térmico físico y zona ideal de carga</div>
					</div>
					<div class="tag" id="rangeTag" style="font-size: 9px;">Zona segura</div>
				</div>
				<div class="chart-wrap" id="chartWrap">
					<div class="empty">Sin telemetría para trazar gráfica.</div>
				</div>
			</section>
		</section>

		<!-- COLUMNA 3: COGNICIÓN E INTEGRACIÓN IA (DERECHA) -->
		<aside class="workspace-ai" style="display: flex; flex-direction: column; gap: 12px; height: 100%;">
			<div class="ai-tab-nav-container">
				<button class="ai-tab-nav-btn active" onclick="switchAiTab('tab-telemetry')">Telemetría</button>
				<button class="ai-tab-nav-btn" onclick="switchAiTab('tab-failures')">Inyector & Colas</button>
			</div>

			<!-- CONTENIDO DE PESTAÑA: TELEMETRÍA -->
			<div id="tab-telemetry" class="ai-tab-content" style="display: flex; flex-direction: column; gap: 12px; flex: 1; min-height: 0;">
				<!-- Telemetría actual instantánea -->
				<section class="card" style="padding: 12px; shrink: 0;">
					<div class="eyebrow" style="margin-bottom:6px; font-size: 9px; letter-spacing: 0.2em;">Métricas Instantáneas</div>
					<div class="metrics" style="grid-template-columns: repeat(2, 1fr); gap: 6px;">
						<div class="metric">
							<span>Temperatura</span>
							<strong id="tempNow">-</strong>
						</div>
						<div class="metric">
							<span>Humedad</span>
							<strong id="humidityNow">-</strong>
						</div>
						<div class="metric">
							<span>Batería</span>
							<strong id="batteryNow">-</strong>
						</div>
						<div class="metric">
							<span>Lecturas</span>
							<strong id="telemetryCount">-</strong>
						</div>
					</div>
				</section>

				<!-- Alertas y diagnósticos de Zep & Groq -->
				<section class="feed-card" style="flex: 1; display: flex; flex-direction: column; min-height: 0;">
					<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; margin-bottom:10px;">
						<div>
							<div class="eyebrow" style="font-size: 9px;">Línea de Eventos (IA)</div>
							<div class="muted" id="backendSummary" style="font-size:10px; margin-top: 2px;">Sin información disponible.</div>
						</div>
						<div class="muted font-mono" id="lastTick" style="font-size:9px; font-weight: 600;">Sin tick.</div>
					</div>
					<div class="feed-list" id="feedList" style="flex: 1; overflow-y: auto;">
						<div class="empty">Esperando telemetría...</div>
					</div>
				</section>
			</div>

			<!-- CONTENIDO DE PESTAÑA: INYECTOR & COLAS -->
			<div id="tab-failures" class="ai-tab-content" style="display: none; flex-direction: column; gap: 12px;">
				<!-- Selected Trip Manual Incident Triggers -->
				<div class="panel" style="padding: 12px;">
					<div class="eyebrow" style="margin-bottom: 8px; font-size: 9px; letter-spacing: 0.2em;">Inyector de Anomalías</div>
					
					<div style="padding: 8px 12px; border-radius: 8px; background: rgba(9, 9, 11, 0.4); border: 1px solid rgba(255,255,255,0.04); display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
						<span style="font-size: 11px; font-weight: 700; color: #cbd5e1;">Falla de Compresor</span>
						<label class="switch danger">
							<input type="checkbox" id="compressorToggle">
							<span class="slider"></span>
						</label>
					</div>
					
					<div style="padding: 8px 12px; border-radius: 8px; background: rgba(9, 9, 11, 0.4); border: 1px solid rgba(255,255,255,0.04); display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
						<span style="font-size: 11px; font-weight: 700; color: #cbd5e1;">Desvío de Ruta (GPS)</span>
						<label class="switch danger">
							<input type="checkbox" id="deviationToggle">
							<span class="slider"></span>
						</label>
					</div>
				</div>

				<!-- NUEVO PANEL: AUDITOR EN VIVO DE REDIS & BULLMQ -->
				<section class="card" style="padding:12px; border: 1px solid rgba(14, 165, 233, 0.15); background: linear-gradient(135deg, rgba(9, 9, 11, 0.8) 0%, rgba(0, 0, 0, 0.95) 100%);">
					<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
						<div class="eyebrow" style="font-size: 9px; letter-spacing: 0.15em; margin-bottom: 0;">Redis & BullMQ IA Queue</div>
						<span class="tag" id="redisConnTag" style="font-size: 8px; font-weight: 800; background: rgba(16, 185, 129, 0.08); color: var(--emerald); border: 1px solid rgba(16, 185, 129, 0.15);">REDIS OK</span>
					</div>
					
					<div class="metrics" style="grid-template-columns: repeat(2, 1fr); gap: 6px; margin-top: 4px;">
						<div class="metric" style="padding: 6px 8px; background: rgba(9, 9, 11, 0.45);">
							<span style="font-size: 8px; color: var(--muted);">En Espera (Waiting)</span>
							<strong id="queueWaiting" style="color: var(--amber); font-size: 1rem; margin-top: 2px;">0</strong>
						</div>
						<div class="metric" style="padding: 6px 8px; background: rgba(9, 9, 11, 0.45);">
							<span style="font-size: 8px; color: var(--muted);">Procesando (Active)</span>
							<strong id="queueActive" style="color: var(--cyan); font-size: 1rem; margin-top: 2px;">0</strong>
						</div>
						<div class="metric" style="padding: 6px 8px; background: rgba(9, 9, 11, 0.45);">
							<span style="font-size: 8px; color: var(--muted);">Completados (Done)</span>
							<strong id="queueCompleted" style="color: var(--emerald); font-size: 1rem; margin-top: 2px;">0</strong>
						</div>
						<div class="metric" style="padding: 6px 8px; background: rgba(9, 9, 11, 0.45);">
							<span style="font-size: 8px; color: var(--muted);">Fallidos (Failed)</span>
							<strong id="queueFailed" style="color: var(--rose); font-size: 1rem; margin-top: 2px;">0</strong>
						</div>
					</div>
					
					<div style="font-size: 9px; color: var(--muted); margin-top: 8px; text-align: center; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 6px; font-family: monospace;">
						ia-analysis-queue (Concurrencia: 1)
					</div>
				</section>
			</div>
		</aside>
	</div>


	<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
	<script>
		function switchSidebarTab(tabId) {
			document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
			document.getElementById(tabId).style.display = tabId === 'tab-trips' ? 'flex' : 'block';
			
			const buttons = document.querySelectorAll('.tab-nav-btn');
			buttons.forEach(btn => btn.classList.remove('active'));
			
			if (tabId === 'tab-trips') {
				buttons[0].classList.add('active');
			} else {
				buttons[1].classList.add('active');
			}
		}

		function switchAiTab(tabId) {
			document.querySelectorAll('.ai-tab-content').forEach(el => el.style.display = 'none');
			document.getElementById(tabId).style.display = tabId === 'tab-telemetry' ? 'flex' : 'block';
			
			const buttons = document.querySelectorAll('.ai-tab-nav-btn');
			buttons.forEach(btn => btn.classList.remove('active'));
			
			if (tabId === 'tab-telemetry') {
				buttons[0].classList.add('active');
			} else {
				buttons[1].classList.add('active');
			}
		}

		function toggleGuide() {
			const content = document.getElementById('guideContent');
			const arrow = document.getElementById('guideArrow');
			if (content && arrow) {
				if (content.style.display === 'none') {
					content.style.display = 'grid';
					arrow.style.transform = 'rotate(180deg)';
				} else {
					content.style.display = 'none';
					arrow.style.transform = 'rotate(0deg)';
				}
			}
		}

		// Token extraction and storage persistence
		const urlParams = new URLSearchParams(window.location.search);
		const queryToken = urlParams.get('token');
		if (queryToken) {
			sessionStorage.setItem('sim_token', queryToken);
			const cleanUrl = window.location.pathname + window.location.hash;
			window.history.replaceState({}, document.title, cleanUrl);
		}
		
		const storedToken = sessionStorage.getItem('sim_token');
		if (storedToken) {
			window.__TOKEN__ = storedToken;
		}

		const apiStateUrl = '/api/state';
		const toggleBtn = document.getElementById('toggleBtn');
		const turboToggle = document.getElementById('turboToggle');
		const iotFailureToggle = document.getElementById('iotFailureToggle');
		const queueToggle = document.getElementById('queueToggle');
		const workerLed = document.getElementById('workerLed');
		const workerStatusText = document.getElementById('workerStatusText');
		const workerQueueDetail = document.getElementById('workerQueueDetail');
		const redisConnTag = document.getElementById('redisConnTag');
		const queueWaiting = document.getElementById('queueWaiting');
		const queueActive = document.getElementById('queueActive');
		const queueCompleted = document.getElementById('queueCompleted');
		const queueFailed = document.getElementById('queueFailed');
		const compressorToggle = document.getElementById('compressorToggle');
		const deviationToggle = document.getElementById('deviationToggle');
		const stepBtn = document.getElementById('stepBtn');
		const openDashboardBtn = document.getElementById('openDashboardBtn');
		const tripList = document.getElementById('tripList');
		const connectionState = document.getElementById('connectionState');
		const statusText = document.getElementById('statusText');
		const activeTrips = document.getElementById('activeTrips');
		const sentTrips = document.getElementById('sentTrips');
		const incidentTrips = document.getElementById('incidentTrips');
		const lastSync = document.getElementById('lastSync');
		const lastTick = document.getElementById('lastTick');
		const selectedTitle = document.getElementById('selectedTitle');
		const selectedSubtitle = document.getElementById('selectedSubtitle');
		const tempNow = document.getElementById('tempNow');
		const humidityNow = document.getElementById('humidityNow');
		const batteryNow = document.getElementById('batteryNow');
		const telemetryCount = document.getElementById('telemetryCount');
		const routeSourceTag = document.getElementById('routeSourceTag');
		const previewTag = document.getElementById('previewTag');
		const stateTag = document.getElementById('stateTag');
		const rangeTag = document.getElementById('rangeTag');
		const iotFailureStatusText = document.getElementById('iotFailureStatusText');
		const mapWrap = document.getElementById('mapWrap');
		const chartWrap = document.getElementById('chartWrap');
		const feedList = document.getElementById('feedList');
		const backendSummary = document.getElementById('backendSummary');
		let leafletMap = null;
		let leafletLayer = null;
		let leafletTripId = null;
		let leafletMapReady = false;
		let renderedMapTripId = null;
		let isUserInteractingMap = false;
		let lastRoutePoints = [];
		let lastTruckPosition = null;

		function escapeHtml(value) {
			return String(value ?? '')
				.replaceAll('&', '&amp;')
				.replaceAll('<', '&lt;')
				.replaceAll('>', '&gt;')
				.replaceAll('"', '&quot;')
				.replaceAll("'", '&#39;');
		}

		function formatDate(value) {
			if (!value) return '-';
			return new Date(value).toLocaleString();
		}

		function formatNumber(value, digits = 1) {
			return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '-';
		}

		function badgeClass(status) {
			if (status === 'alerta') return 'tag alerta';
			if (status === 'error') return 'tag error';
			if (status === 'pausado') return 'tag pausado';
			return 'tag activo';
		}

		function getRoutePoints(detail) {
			const preview = detail?.routePreview?.geometry;
			if (Array.isArray(preview) && preview.length > 1) {
				return preview.map(([lon, lat]) => ({ lon: Number(lon), lat: Number(lat) }));
			}
			return Array.isArray(detail?.viaje?.routePoints) ? detail.viaje.routePoints : [];
		}

		function getProgressPoint(points, simulation) {
			if (!Array.isArray(points) || points.length === 0) return null;
			if (points.length === 1) return points[0];

			const segmentIndex = Math.max(0, Math.min(points.length - 2, Number(simulation?.progressIndex || 0)));
			const start = points[segmentIndex];
			const end = points[segmentIndex + 1];
			const progress = Math.max(0, Math.min(1, Number(simulation?.progressStep || 0)));
			return {
				lon: start.lon + (end.lon - start.lon) * progress,
				lat: start.lat + (end.lat - start.lat) * progress,
			};
		}

		function getTelemetryAlerts(detail) {
			const telemetry = Array.isArray(detail?.telemetry) ? detail.telemetry : [];
			const minTemp = Number(detail?.viaje?.limite_min_temp ?? detail?.viaje?.limite_max_temp - 3 ?? 0);
			const maxTemp = Number(detail?.viaje?.limite_max_temp ?? 0);

			return telemetry
				.filter((row) => Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lon)))
				.map((row) => {
					const temp = Number(row.temp);
					const battery = row.bateria == null ? null : Number(row.bateria);
					const isTempAlert = Number.isFinite(temp) && (temp > maxTemp || temp < minTemp);
					const isBatteryAlert = battery != null && battery <= 10;

					return {
						...row,
						kind: isTempAlert ? 'temp' : isBatteryAlert ? 'battery' : null,
						label: isTempAlert ? 'Temperatura fuera de rango' : isBatteryAlert ? 'Batería baja' : null,
					};
				})
				.filter((row) => row.kind);
		}

		function getChartTelemetry(detail, simulation) {
			const backendTelemetry = Array.isArray(detail?.telemetry) ? detail.telemetry : [];
			if (backendTelemetry.length > 0) {
				return backendTelemetry;
			}

			const history = Array.isArray(simulation?.history) ? simulation.history : [];
			return history.map((entry, index) => ({
				id: entry.id || 'fallback-' + index,
				temp: asNumber(entry.temp),
				humedad: null,
				bateria: entry.battery == null ? null : asNumber(entry.battery),
				lat: asNumber(entry.lat),
				lon: asNumber(entry.lon),
				timestamp_sensor: entry.timestamp || null,
				ia_diagnosis: entry.ia_diagnosis || null,
			}));
		}

		function toSvgPoint(point, bounds, width, height, pad = 28) {
			const lonSpan = Math.max(bounds.maxLon - bounds.minLon, 0.0001);
			const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.0001);
			const x = pad + ((point.lon - bounds.minLon) / lonSpan) * (width - pad * 2);
			const y = height - pad - ((point.lat - bounds.minLat) / latSpan) * (height - pad * 2);
			return { x, y };
		}

		function computeBounds(points) {
			return points.reduce((acc, point) => ({
				minLon: Math.min(acc.minLon, point.lon),
				maxLon: Math.max(acc.maxLon, point.lon),
				minLat: Math.min(acc.minLat, point.lat),
				maxLat: Math.max(acc.maxLat, point.lat),
			}), { minLon: points[0].lon, maxLon: points[0].lon, minLat: points[0].lat, maxLat: points[0].lat });
		}

		function renderMap(detail, simulation) {
			const points = getRoutePoints(detail);
			if (points.length < 2) {
				return '<div class="empty">No hay geometría suficiente para dibujar la ruta.</div>';
			}
			const status = simulation?.status || detail?.viaje?.estado || 'activo';
			return '<div class="map-shell" style="position: relative;">'
				+ '<div class="map-hud">'
				+ '<span class="tag osrm">Mapa real · Arrastra y haz zoom</span>'
				+ '<span class="tag ' + (status === 'alerta' ? 'alerta' : 'activo') + '">' + escapeHtml(status) + '</span>'
				+ '</div>'
				+ '<div class="leaflet-map" id="leafletMap"></div>'
				+ '<button id="resetMapCam" style="display: none; position: absolute; bottom: 80px; right: 10px; z-index: 1000; background: rgba(19, 24, 36, 0.9); border: 1px solid var(--cyan); backdrop-filter: blur(10px); color: var(--cyan); font-weight: 700; padding: 10px 14px; border-radius: 14px; cursor: pointer; font-size: 12px; transition: transform 0.15s ease, background 0.15s ease; box-shadow: 0 4px 12px rgba(0,0,0,0.5);" onmouseover="this.style.transform=\'translateY(-1px)\'" onmouseout="this.style.transform=\'none\'">Volver al camión</button>'
				+ '<div class="map-banner" id="mapBanner"><strong>' + escapeHtml(status === 'alerta' ? 'Alerta térmica' : 'Ruta activa') + '.</strong> Usa la rueda o arrastra el mapa para inspeccionar la ruta.</div>'
				+ '<div class="map-legend" aria-label="Leyenda del mapa">'
				+ '<div class="legend-row"><span class="legend-dot route"></span>Ruta activa</div>'
				+ '<div class="legend-row"><span class="legend-dot current"></span>Posición actual</div>'
				+ '<div class="legend-row"><span class="legend-dot temp"></span>Temperatura alta</div>'
				+ '<div class="legend-row"><span class="legend-dot battery"></span>Batería baja</div>'
				+ '</div>'
				+ '<div class="map-fallback" id="mapFallback">Cargando mapa real… si no aparece, revisa la conexión al CDN.</div>'
				+ '</div>';
		}

		function updateInteractiveMap(detail, simulation) {
			if (!window.L) return;

			const points = getRoutePoints(detail);
			const mapElement = document.getElementById('leafletMap');
			const fallback = document.getElementById('mapFallback');
			const banner = document.getElementById('mapBanner');
			if (!mapElement || points.length < 2) return;

			const route = points.map((point) => [point.lat, point.lon]);
			const progressPoint = getProgressPoint(points, simulation) || points[0];
			const currentStatus = simulation?.status || detail?.viaje?.estado || 'activo';
			const alerts = getTelemetryAlerts(detail);

			if (!leafletMap || leafletMap.getContainer() !== mapElement) {
				if (leafletMap) {
					leafletMap.remove();
				}

				leafletMap = window.L.map(mapElement, {
					zoomControl: true,
					preferCanvas: true,
					scrollWheelZoom: true,
					dragging: true,
					doubleClickZoom: true,
				}).setView(route[0], 12);

				window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
					attribution: '&copy; OpenStreetMap contributors',
					maxZoom: 19,
				}).addTo(leafletMap);

				leafletLayer = window.L.layerGroup().addTo(leafletMap);
				leafletMapReady = true;
				leafletTripId = null;

				// Registrar listeners de interacción del usuario
				leafletMap.on('dragstart', () => {
					isUserInteractingMap = true;
					const resetBtn = document.getElementById('resetMapCam');
					if (resetBtn) resetBtn.style.display = 'block';
				});

				leafletMap.on('zoomstart', () => {
					isUserInteractingMap = true;
					const resetBtn = document.getElementById('resetMapCam');
					if (resetBtn) resetBtn.style.display = 'block';
				});
			}

			if (!leafletLayer) return;
			leafletLayer.clearLayers();

			// Actualizar última ruta para recentrar de forma manual
			lastRoutePoints = route;
			lastTruckPosition = [progressPoint.lat, progressPoint.lon];

			const bounds = window.L.latLngBounds(route);
			window.L.polyline(route, {
				color: '#7dd3fc',
				weight: 5,
				opacity: 0.95,
				lineCap: 'round',
				lineJoin: 'round',
			}).addTo(leafletLayer);

			window.L.circleMarker(route[0], {
				radius: 8,
				color: '#22c55e',
				weight: 3,
				fillColor: '#0f172a',
				fillOpacity: 1,
			}).bindTooltip('Origen', { sticky: true }).addTo(leafletLayer);

			window.L.circleMarker(route[route.length - 1], {
				radius: 8,
				color: '#ef4444',
				weight: 3,
				fillColor: '#0f172a',
				fillOpacity: 1,
			}).bindTooltip('Destino', { sticky: true }).addTo(leafletLayer);

			const isDeviated = !!simulation?.routeDeviated;
			window.L.circleMarker([progressPoint.lat, progressPoint.lon], {
				radius: currentStatus === 'alerta' ? 12 : 9,
				color: currentStatus === 'alerta' ? '#ef4444' : isDeviated ? '#f59e0b' : '#4cc9f0',
				weight: 4,
				fillColor: '#020617',
				fillOpacity: 1,
			}).bindTooltip(
				currentStatus === 'alerta' ? 'Alerta térmica' : isDeviated ? '⚠ Desvío GPS activo' : 'Posición actual',
				{ sticky: true }
			).addTo(leafletLayer);

			if (isDeviated) {
				window.L.circleMarker([progressPoint.lat, progressPoint.lon], {
					radius: 22,
					color: '#f59e0b',
					weight: 2,
					fillColor: '#f59e0b',
					fillOpacity: 0.12,
				}).addTo(leafletLayer);
			}

			alerts.forEach((alert) => {
				const isTempAlert = alert.kind === 'temp';
				window.L.circleMarker([Number(alert.lat), Number(alert.lon)], {
					radius: isTempAlert ? 10 : 9,
					color: isTempAlert ? '#ef4444' : '#f59e0b',
					weight: 3,
					fillColor: isTempAlert ? '#7f1d1d' : '#78350f',
					fillOpacity: 0.88,
				}).bindTooltip(alert.label + ' · ' + formatDate(alert.timestamp_sensor), { sticky: true }).addTo(leafletLayer);

				window.L.circleMarker([Number(alert.lat), Number(alert.lon)], {
					radius: isTempAlert ? 18 : 16,
					color: isTempAlert ? '#ef4444' : '#f59e0b',
					weight: 1,
					fillColor: isTempAlert ? '#ef4444' : '#f59e0b',
					fillOpacity: 0.12,
				}).addTo(leafletLayer);
			});

			if (currentStatus === 'alerta') {
				window.L.circleMarker([progressPoint.lat, progressPoint.lon], {
					radius: 20,
					color: '#ef4444',
					weight: 2,
					fillColor: '#ef4444',
					fillOpacity: 0.12,
				}).addTo(leafletLayer);
			}

			if (fallback) {
				fallback.style.display = 'none';
			}

			if (banner) {
				banner.innerHTML = currentStatus === 'alerta'
					? '<strong>Alerta térmica activa.</strong> La posición actual está resaltada en rojo.'
					: '<strong>Ruta activa.</strong> Puedes mover el mapa libremente sin que se recenterice.';
			}

			const selectedTripId = detail?.viaje?.id || null;
			if (selectedTripId && selectedTripId !== leafletTripId) {
				leafletMap.fitBounds(bounds.pad(0.2), { animate: true });
				leafletTripId = selectedTripId;
				isUserInteractingMap = false;
				const resetBtn = document.getElementById('resetMapCam');
				if (resetBtn) resetBtn.style.display = 'none';
			} else if (selectedTripId && leafletMapReady && !isUserInteractingMap) {
				if (!leafletMap.getBounds().contains(bounds)) {
					leafletMap.fitBounds(bounds.pad(0.1), { animate: false });
				}
			}
		}

		function renderChart(detail, simulation) {
			const telemetry = getChartTelemetry(detail, simulation);
			if (!telemetry.length) {
				return '<div class="empty">Sin telemetría histórica para graficar.</div>';
			}

			const minTemp = Number(detail?.viaje?.limite_min_temp ?? detail?.viaje?.limite_max_temp - 3 ?? 0);
			const maxTemp = Number(detail?.viaje?.limite_max_temp ?? 0);
			const temps = telemetry.map((point) => Number(point.temp));
			const low = Math.min(minTemp - 3, ...temps) - 1;
			const high = Math.max(maxTemp + 3, ...temps) + 1;
			const width = Math.max(1120, telemetry.length * 92);
			const height = 240;
			const pad = 34;

			const xStep = telemetry.length > 1 ? (width - pad * 2) / (telemetry.length - 1) : 0;
			const yScale = (temp) => height - pad - ((temp - low) / (high - low)) * (height - pad * 2);
			const xScale = (index) => pad + index * xStep;
			const linePoints = telemetry.map((point, index) => xScale(index).toFixed(1) + ',' + yScale(Number(point.temp)).toFixed(1)).join(' ');

			return '<div class="chart-scroll" style="width: ' + width + 'px; height: 100%;">'
				+ '<svg class="chart-svg" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" role="img" aria-label="Gráfica térmica">'
				+ '<defs>'
				+ '<linearGradient id="safeZoneGrad" x1="0" y1="0" x2="0" y2="1">'
				+ '<stop offset="0%" stop-color="#10b981" stop-opacity="0.04"/>'
				+ '<stop offset="100%" stop-color="#10b981" stop-opacity="0.01"/>'
				+ '</linearGradient>'
				+ '</defs>'
				+ '<rect width="' + width + '" height="' + height + '" fill="#000000" />'
				+ '<rect x="' + pad + '" y="' + yScale(maxTemp) + '" width="' + (width - pad * 2) + '" height="' + (yScale(minTemp) - yScale(maxTemp)) + '" fill="url(#safeZoneGrad)" stroke="rgba(16,185,129,0.18)" stroke-width="1" stroke-dasharray="4 4" />'
				+ Array.from({ length: 5 }, (_, index) => '<line x1="' + pad + '" y1="' + (pad + index * ((height - pad * 2) / 4)) + '" x2="' + (width - pad) + '" y2="' + (pad + index * ((height - pad * 2) / 4)) + '" stroke="rgba(255, 255, 255, 0.03)" />').join('')
				+ '<line x1="' + pad + '" y1="' + yScale(minTemp) + '" x2="' + (width - pad) + '" y2="' + yScale(minTemp) + '" stroke="rgba(16,185,129,0.3)" stroke-width="1.5" />'
				+ '<line x1="' + pad + '" y1="' + yScale(maxTemp) + '" x2="' + (width - pad) + '" y2="' + yScale(maxTemp) + '" stroke="rgba(244,63,94,0.3)" stroke-width="1.5" />'
				+ '<polyline points="' + linePoints + '" fill="none" stroke="#0ea5e9" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />'
				+ telemetry.map((point, index) => {
					const temp = Number(point.temp);
					const x = xScale(index);
					const y = yScale(temp);
					const breach = temp > maxTemp || temp < minTemp || (point.bateria != null && Number(point.bateria) <= 10);
					return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (breach ? 6 : 4) + '" fill="' + (breach ? '#f43f5e' : '#38bdf8') + '" stroke="#000000" stroke-width="1.5" />';
				}).join('')
				+ '</svg>'
				+ '</div>';
		}

		function renderFeed(detail) {
			const telemetry = Array.isArray(detail?.telemetry) ? detail.telemetry.slice().reverse() : [];
			if (!telemetry.length) {
				return '<div class="empty">El backend aún no ha devuelto telemetría para este viaje.</div>';
			}

			const formatNewlines = (text) => {
				return String(text ?? '').replaceAll('\n', '<br/>');
			};

			return telemetry.slice(0, 8).map((point) => {
				const breach = Number(point.temp) > Number(detail?.viaje?.limite_max_temp ?? 0) || Number(point.temp) < Number(detail?.viaje?.limite_min_temp ?? 0);
				
				const telemetryLine = '<div style="color: #94a3b8; font-size: 11px; margin-top: 4px; margin-bottom: 2px;">'
					+ 'Temp: ' + formatNumber(point.temp) + '°C · Hum: ' + formatNumber(point.humedad) + '% · Bat: ' + formatNumber(point.bateria, 0) + '%'
					+ '</div>';

				const iaCardStyle = breach
					? 'background: rgba(239, 68, 68, 0.04); border-color: rgba(239, 68, 68, 0.25); border-left-color: var(--rose);'
					: '';
				const iaHeaderStyle = breach
					? 'color: #fca5a5; border-bottom-color: rgba(239, 68, 68, 0.15);'
					: '';

				const iaBlock = point.ia_diagnosis
					? '<div class="ia-diagnosis-card" style="' + iaCardStyle + '">'
						+ '<div class="ia-diagnosis-header" style="' + iaHeaderStyle + '">'
						+ '<span>DIAGNÓSTICO AUTOMATIZADO DE INCIDENTE (IA)</span>'
						+ '</div>'
						+ '<div class="ia-diagnosis-body">'
						+ formatNewlines(escapeHtml(point.ia_diagnosis))
						+ '</div>'
						+ '</div>'
					: '';

				const feedItemStyle = breach
					? 'margin-bottom: 10px; padding: 14px; background: linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(0, 0, 0, 0.95) 100%); border: 1px solid rgba(239, 68, 68, 0.2); border-left: 3px solid var(--rose);'
					: 'margin-bottom: 10px; padding: 14px;';

				const badge = breach
					? '<span class="tag" style="background: rgba(239, 68, 68, 0.12); color: var(--rose); border: 1px solid rgba(239, 68, 68, 0.3); font-size: 8px; font-weight: 800; text-transform: uppercase; margin-left: 8px;">ANOMALÍA DETECTADA</span>'
					: '';

				return '<div class="feed-item" style="' + feedItemStyle + '">'
					+ '<div style="display:flex; justify-content:space-between; align-items: flex-start;">'
					+ '<div style="display:flex; align-items: center;">'
					+ '<strong class="text-gradient">' + (breach ? 'Incidente detectado' : 'Telemetría recibida') + '</strong>'
					+ badge
					+ '</div>'
					+ '<small style="color: var(--muted); font-size: 11px;">' + formatDate(point.timestamp_sensor) + '</small>'
					+ '</div>'
					+ telemetryLine
					+ iaBlock
					+ '</div>';
			}).join('');
		}

		function renderTrips(state) {
			const trips = Array.isArray(state?.simulations) ? state.simulations : [];
			if (!trips.length) {
				return '<div class="empty">No hay viajes activos ni pendientes. Crea un envío desde el Panel de Control para comenzar.</div>';
			}

			return trips.map((trip) => {
				const status = trip.status || 'activo';
				const lastPayload = trip.lastPayload || {};
				const isPendiente = trip.backendEstado === 'pendiente';
				const diagnostic = trip.lastError || state.lastError || null;
				const signalLost = !!state?.iotFailure || Number(trip.offlineBufferLength || 0) > 0;
				const signalTag = signalLost
					? '<span class="tag error" style="margin-left:8px;background:rgba(239,68,68,0.12);color:var(--rose);border:1px solid rgba(239,68,68,0.3);">SIN SEÑAL IoT</span>'
					: '';
				const bufferTag = Number(trip.offlineBufferLength || 0) > 0
					? '<span class="tag" style="margin-left:8px;background:rgba(245,158,11,0.12);color:#fbbf24;border:1px solid rgba(245,158,11,0.3);">BÚFER ' + escapeHtml(trip.offlineBufferLength) + '</span>'
					: '';

				const iniciarBtn = isPendiente
					? '<button class="btn-iniciar-viaje" data-viaje-id="' + escapeHtml(trip.viajeId) + '" style="margin-top:8px;width:100%;padding:6px 10px;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.4);border-radius:6px;color:#fbbf24;font-size:11px;font-weight:700;cursor:pointer;letter-spacing:0.04em;">▶ INICIAR VIAJE</button>'
					: '';

				return '<div class="stack-item ' + (state.selectedTripId === trip.viajeId ? 'active' : '') + '" data-trip-id="' + escapeHtml(trip.viajeId) + '">'
					+ '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">'
					+ '<div style="flex:1;min-width:0;">'
					+ '<div class="eyebrow">' + escapeHtml(trip.viajeId) + '</div>'
					+ '<div class="text-gradient" style="margin-top:6px;font-weight:800;display:block;">' + escapeHtml(isPendiente ? 'En espera de despacho' : (trip.status === 'alerta' ? 'Viaje en alerta' : 'Viaje en simulación')) + '</div>'
					+ '<div class="muted" style="margin-top:4px;font-size:12px;">'
					+ (isPendiente ? 'Pendiente de inicio' : 'Temp ' + formatNumber(lastPayload.temp) + '°C · Bat ' + formatNumber(lastPayload.bateria, 0) + '%')
					+ '</div>'
					+ (diagnostic ? '<div style="margin-top:6px;font-size:10px;color:#fca5a5;font-family:monospace;">' + escapeHtml(diagnostic) + '</div>' : '')
					+ ((signalLost || bufferTag) ? '<div style="margin-top:6px; font-size:11px; color: var(--rose);">' + signalTag + bufferTag + '</div>' : '')
					+ iniciarBtn
					+ '</div>'
					+ '<span class="' + (isPendiente ? 'tag' : badgeClass(status)) + '" style="' + (isPendiente ? 'background:rgba(245,158,11,0.12);color:#fbbf24;border:1px solid rgba(245,158,11,0.3);' : '') + '">' + escapeHtml(isPendiente ? 'pendiente' : status) + '</span>'
					+ '</div>'
					+ '</div>';
			}).join('');
		}

		async function postJson(path, body) {
			const headers = {};
			if (body) {
				headers['Content-Type'] = 'application/json';
			}
			if (window.__TOKEN__) {
				headers['Authorization'] = 'Bearer ' + window.__TOKEN__;
			}
			const response = await fetch(path, {
				method: 'POST',
				headers: Object.keys(headers).length > 0 ? headers : undefined,
				body: body ? JSON.stringify(body) : undefined,
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(data?.message || 'No se pudo completar la acción.');
			}
			return data;
		}

		function updatePage(state) {
			const simulations = Array.isArray(state?.simulations) ? state.simulations : [];
			const runningOrPaused = simulations.filter((trip) => ['activo', 'alerta', 'pausado'].includes(trip.status)).length;
			const derivedTelemetry = simulations.reduce((sum, trip) => sum + Number(trip.telemetryCount || 0), 0);
			const derivedIncidents = simulations.reduce((sum, trip) => sum + Number(trip.incidentCount || 0), 0);
			const queue = {
				isPaused: !!state.queueMetrics?.isPaused,
				waiting: Number(state.queueMetrics?.waiting ?? 0),
				active: Number(state.queueMetrics?.active ?? 0),
				completed: Number(state.queueMetrics?.completed ?? 0),
				failed: Number(state.queueMetrics?.failed ?? 0),
				redisConnected: !!state.queueMetrics?.redisConnected,
			};

			if (turboToggle) {
				turboToggle.checked = !!state.turboMode;
			}
			if (iotFailureToggle) {
				iotFailureToggle.checked = !!state.iotFailure;
			}
			if (queueToggle) {
				queueToggle.checked = !queue.isPaused;
			}
			if (workerLed && workerStatusText) {
				if (queue.isPaused) {
					workerLed.style.backgroundColor = 'var(--amber)';
					workerLed.style.boxShadow = '0 0 8px var(--amber)';
					workerStatusText.textContent = 'Worker: OFFLINE (Cola Pausada)';
				} else if (!queue.redisConnected) {
					workerLed.style.backgroundColor = 'var(--rose)';
					workerLed.style.boxShadow = '0 0 8px var(--rose)';
					workerStatusText.textContent = 'Worker: SIN DATOS (Redis desconectado)';
				} else {
					workerLed.style.backgroundColor = 'var(--emerald)';
					workerLed.style.boxShadow = '0 0 8px var(--emerald)';
					workerStatusText.textContent = 'Worker: ONLINE';
				}
			}
			if (workerQueueDetail) {
				workerQueueDetail.textContent = queue.isPaused
					? 'Cola IA: pausada · waiting=' + queue.waiting + ' · failed=' + queue.failed
					: 'Cola IA: activa · waiting=' + queue.waiting + ' · failed=' + queue.failed;
			}
			if (iotFailureStatusText) {
				iotFailureStatusText.textContent = state.iotFailure
					? 'Estado: sin señal · buffer global activo'
					: 'Estado: normal';
			}
			if (state.lastSignalEvent) {
				const eventText = state.lastSignalEvent.message || state.lastSignalEvent.type || 'Sin evento';
				if (iotFailureStatusText) {
					iotFailureStatusText.textContent = state.iotFailure
						? 'Estado: sin señal · buffer global activo'
						: 'Estado: normal';
				}
				if (workerQueueDetail) {
					workerQueueDetail.textContent = (queue.isPaused
						? 'Cola IA: pausada · waiting=' + queue.waiting + ' · failed=' + queue.failed
						: 'Cola IA: activa · waiting=' + queue.waiting + ' · failed=' + queue.failed) + ' · diag=' + eventText;
				}
			}
			if (queueWaiting) queueWaiting.textContent = String(queue.waiting);
			if (queueActive) queueActive.textContent = String(queue.active);
			if (queueCompleted) queueCompleted.textContent = String(queue.completed);
			if (queueFailed) queueFailed.textContent = String(queue.failed);
			if (redisConnTag) {
				if (queue.redisConnected) {
					redisConnTag.textContent = 'REDIS OK';
					redisConnTag.style.background = 'rgba(16, 185, 129, 0.08)';
					redisConnTag.style.color = 'var(--emerald)';
					redisConnTag.style.borderColor = 'rgba(16, 185, 129, 0.15)';
				} else {
					redisConnTag.textContent = 'REDIS OFFLINE';
					redisConnTag.style.background = 'rgba(239, 68, 68, 0.08)';
					redisConnTag.style.color = 'var(--rose)';
					redisConnTag.style.borderColor = 'rgba(239, 68, 68, 0.15)';
				}
			}
			if (activeTrips) activeTrips.textContent = String(Number(state.activeTrips ?? runningOrPaused));
			if (sentTrips) sentTrips.textContent = String(Math.max(Number(state.totalSent ?? 0), derivedTelemetry));
			if (incidentTrips) incidentTrips.textContent = String(Math.max(Number(state.totalIncidents ?? 0), derivedIncidents));
			lastSync.textContent = formatDate(state.lastSyncAt);
			lastTick.textContent = state.lastTickAt ? 'Último tick: ' + formatDate(state.lastTickAt) : 'Sin tick aún.';
			if (statusText) statusText.textContent = state.paused ? 'Simulación pausada' : 'Simulación activa';
			
			const led = document.getElementById('ledStatus');
			const connText = document.getElementById('connectionText');
			if (led && connText) {
				if (state.paused) {
					led.className = 'led-indicator paused';
					connText.textContent = 'Worker detenido';
				} else {
					led.className = 'led-indicator active';
					connText.textContent = 'Worker ejecutándose';
				}
			} else {
				connectionState.textContent = state.paused ? 'Worker detenido' : 'Worker ejecutándose';
			}
			
			toggleBtn.textContent = state.paused ? 'Reanudar' : 'Pausar';

			tripList.innerHTML = renderTrips(state);

			const detail = state.selectedDetail;
			const simulation = (state.simulations || []).find((trip) => trip.viajeId === state.selectedTripId) || null;

			if (!detail || !detail.viaje?.id) {
				selectedTitle.textContent = 'Sin viaje seleccionado';
				selectedSubtitle.textContent = 'Selecciona un viaje para ver mapa, telemetría y señales OSRM.';
				mapWrap.innerHTML = '<div class="empty">Sin viaje seleccionado.</div>';
				renderedMapTripId = null;
				chartWrap.innerHTML = '<div class="empty">Sin telemetría.</div>';
				chartWrap.removeAttribute('data-fingerprint');
				feedList.innerHTML = '<div class="empty">Sin datos.</div>';
				feedList.removeAttribute('data-fingerprint');
				backendSummary.textContent = 'Sin detalle disponible.';
				telemetryCount.textContent = '-';
				stateTag.textContent = 'sin datos';
				routeSourceTag.textContent = 'fallback';
				if (previewTag) previewTag.textContent = 'OSRM';
				
				if (compressorToggle) {
					compressorToggle.checked = false;
					compressorToggle.disabled = true;
				}
				if (deviationToggle) {
					deviationToggle.checked = false;
					deviationToggle.disabled = true;
				}

				return;
			}

			const viaje = detail.viaje;
			const interp = detail.interpretation || {};
			selectedTitle.textContent = viaje.id;
			selectedSubtitle.textContent = (viaje.tipo_producto || 'Carga') + ' · ' + (viaje.estado || 'en_curso') + ' · ' + (viaje.origen_sucursal_nombre || 'Origen') + ' -> ' + (viaje.destino_sucursal_nombre || 'Destino');
			if (state.iotFailure) {
				selectedSubtitle.textContent += ' · ENLACE IoT SIN SEÑAL';
			}
			if (simulation?.routeDeviated) {
				selectedSubtitle.textContent += ' · ⚠ DESVÍO GPS ACTIVO';
			}
			tempNow.textContent = formatNumber(simulation?.lastPayload?.temp ?? interp.latestTelemetry?.temp);
			humidityNow.textContent = formatNumber(simulation?.lastPayload?.humedad ?? interp.latestTelemetry?.humedad);
			batteryNow.textContent = formatNumber(simulation?.lastPayload?.bateria ?? interp.latestTelemetry?.bateria, 0);
			telemetryCount.textContent = String(interp.telemetryCount ?? 0);
			stateTag.textContent = simulation?.status || viaje.estado || 'activo';
			stateTag.className = badgeClass(simulation?.status || viaje.estado || 'activo');
			routeSourceTag.textContent = interp.previewMode === 'osrm' ? 'OSRM' : 'fallback';
			routeSourceTag.className = interp.previewMode === 'osrm' ? 'tag osrm' : 'tag';
			if (previewTag) {
				previewTag.textContent = interp.previewMode === 'osrm' ? 'Ruta OSRM' : 'Ruta fallback';
				previewTag.className = interp.previewMode === 'osrm' ? 'tag osrm' : 'tag';
			}
			rangeTag.textContent = 'Zona ' + formatNumber(viaje.limite_min_temp) + '°C a ' + formatNumber(viaje.limite_max_temp) + '°C';

			if (compressorToggle) {
				compressorToggle.checked = !!simulation?.compressorFailed;
				compressorToggle.disabled = false;
			}
			if (deviationToggle) {
				deviationToggle.checked = !!simulation?.routeDeviated;
				deviationToggle.disabled = false;
			}


			const mapAlreadyHasShell = !!mapWrap.querySelector('.map-shell');
			if (renderedMapTripId !== viaje.id || (!mapAlreadyHasShell && getRoutePoints(detail).length >= 2)) {
				mapWrap.innerHTML = renderMap(detail, simulation);
				renderedMapTripId = viaje.id;
			}
			
			const telemetry = getChartTelemetry(detail, simulation);
			const telemetryFingerprint = viaje.id + '_' + telemetry.length + '_' + (telemetry.length > 0 ? telemetry[telemetry.length - 1].timestamp_sensor + '_' + telemetry[telemetry.length - 1].temp : '');
			if (chartWrap.getAttribute('data-fingerprint') !== telemetryFingerprint) {
				chartWrap.innerHTML = renderChart(detail, simulation);
				chartWrap.setAttribute('data-fingerprint', telemetryFingerprint);
			}

			const feedTelemetry = Array.isArray(detail?.telemetry) ? detail.telemetry : [];
			const feedFingerprint = viaje.id + '_' + feedTelemetry.length + '_' + (feedTelemetry.length > 0 ? feedTelemetry[0].timestamp_sensor + '_' + feedTelemetry[0].temp : '');
			if (feedList.getAttribute('data-fingerprint') !== feedFingerprint) {
				feedList.innerHTML = renderFeed(detail);
				feedList.setAttribute('data-fingerprint', feedFingerprint);
			}

			requestAnimationFrame(() => updateInteractiveMap(detail, simulation));

			backendSummary.innerHTML = '<strong>' + interp.telemetryCount + '</strong> lecturas interpretadas por el backend. <br />'
				+ 'Incidentes térmicos: <strong>' + interp.breachedCount + '</strong>. <br />'
				+ 'Último dato: <strong>' + formatDate(interp.latestTelemetry?.timestamp_sensor) + '</strong>';
		}

		async function refreshState() {
			try {
				const headers = {};
				if (window.__TOKEN__) {
					headers['Authorization'] = 'Bearer ' + window.__TOKEN__;
				}
				const response = await fetch(apiStateUrl, {
					cache: 'no-store',
					headers: Object.keys(headers).length > 0 ? headers : undefined,
				});
				if (!response.ok) {
					throw new Error('No se pudo leer el estado del simulador.');
				}

				const state = await response.json();
				updatePage(state);
			} catch (error) {
				connectionState.textContent = error instanceof Error ? error.message : 'Error inesperado';
			}
		}

		tripList.addEventListener('click', async (event) => {
			const iniciarBtn = event.target.closest('.btn-iniciar-viaje');
			if (iniciarBtn) {
				event.stopPropagation();
				const viajeId = iniciarBtn.getAttribute('data-viaje-id');
				if (!viajeId) return;
				iniciarBtn.disabled = true;
				iniciarBtn.textContent = 'Iniciando...';
				try {
					await postJson('/api/simulation/iniciar-viaje', { viajeId });
					await refreshState();
				} catch (error) {
					console.error('Error al iniciar viaje:', error);
					iniciarBtn.disabled = false;
					iniciarBtn.textContent = '▶ INICIAR VIAJE';
				}
				return;
			}
			const item = event.target.closest('[data-trip-id]');
			if (!item) return;
			const tripId = item.getAttribute('data-trip-id');
			if (!tripId) return;
			await postJson('/api/simulation/select', { viajeId: tripId });
			await refreshState();
		});

		mapWrap.addEventListener('click', (event) => {
			if (event.target.id === 'resetMapCam') {
				isUserInteractingMap = false;
				const btn = document.getElementById('resetMapCam');
				if (btn) btn.style.display = 'none';
				if (leafletMap && lastTruckPosition) {
					leafletMap.setView(lastTruckPosition, 16, { animate: true });
				} else if (leafletMap && lastRoutePoints.length > 0) {
					leafletMap.fitBounds(window.L.latLngBounds(lastRoutePoints), { animate: true });
				}
			}
		});

		toggleBtn.addEventListener('click', async () => {
			toggleBtn.disabled = true;
			try {
				await postJson('/api/simulation/toggle');
				await refreshState();
			} finally {
				toggleBtn.disabled = false;
			}
		});

		stepBtn.addEventListener('click', async () => {
			stepBtn.disabled = true;
			try {
				await postJson('/api/simulation/step');
				await refreshState();
			} finally {
				stepBtn.disabled = false;
			}
		});

		openDashboardBtn.addEventListener('click', () => {
			window.open('http://localhost:3001/dashboard', '_blank', 'noreferrer');
		});



		if (turboToggle) {
			turboToggle.addEventListener('change', async () => {
				turboToggle.disabled = true;
				try {
					await postJson('/api/simulation/toggle-turbo', { enabled: turboToggle.checked });
				} catch (error) {
					console.error(error);
				} finally {
					turboToggle.disabled = false;
				}
			});
		}

		if (iotFailureToggle) {
			iotFailureToggle.addEventListener('change', async () => {
				iotFailureToggle.disabled = true;
				try {
					await postJson('/api/simulation/toggle-iot-link', { enabled: iotFailureToggle.checked });
				} catch (error) {
					console.error(error);
				} finally {
					iotFailureToggle.disabled = false;
				}
			});
		}

		if (queueToggle) {
			queueToggle.addEventListener('change', async () => {
				queueToggle.disabled = true;
				try {
					await postJson('/api/simulation/toggle-queue');
					await refreshState();
				} catch (error) {
					console.error(error);
				} finally {
					queueToggle.disabled = false;
				}
			});
		}

		if (compressorToggle) {
			compressorToggle.addEventListener('change', async () => {
				const activeTrip = document.querySelector('.stack-item.active');
				const viajeId = activeTrip ? activeTrip.getAttribute('data-trip-id') : null;
				if (!viajeId) return;

				compressorToggle.disabled = true;
				try {
					await postJson('/api/simulation/toggle-compressor', { viajeId, enabled: compressorToggle.checked });
				} catch (error) {
					console.error(error);
				} finally {
					compressorToggle.disabled = false;
				}
			});
		}

		if (deviationToggle) {
			deviationToggle.addEventListener('change', async () => {
				const activeTrip = document.querySelector('.stack-item.active');
				const viajeId = activeTrip ? activeTrip.getAttribute('data-trip-id') : null;
				if (!viajeId) return;

				deviationToggle.disabled = true;
				try {
					await postJson('/api/simulation/toggle-deviation', { viajeId, enabled: deviationToggle.checked });
				} catch (error) {
					console.error(error);
				} finally {
					deviationToggle.disabled = false;
				}
			});
		}



		refreshState();
		setInterval(refreshState, 3000);
	</script>
</body>
</html>`;
}

module.exports = {
	renderDashboardPage,
};
