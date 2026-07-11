<script lang="ts">
	import './layout.css';

	let { children } = $props();
</script>

<div class="min-h-screen bg-gray-100">
	<!-- <header class="bg-white border-b border-gray-200 shadow-sm">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<a href="/" class="text-xl font-bold text-gray-900">
						<span class="text-blue-600">EBA</span> ↔ <span class="text-red-600">REGAFI</span>
					</a>
					<span class="text-sm text-gray-500 hidden sm:inline">Comparateur de registres PSD2</span>
				</div>
				<div class="text-xs text-gray-400">
					<a href="/" class="hover:text-gray-600">Accueil</a>
				</div>
			</div>
		</div>
	</header> -->

	<main class="w-full px-4 sm:px-6 lg:px-8 py-6">
		{@render children()}
	</main>

	<!-- <footer class="bg-white border-t border-gray-200 mt-8">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-center text-xs text-gray-400">
			Source data: <a href="https://euclid.eba.europa.eu/register/pir" class="underline hover:text-gray-600" target="_blank">EBA EUCLID PIR</a>
			· <a href="https://developer.regafi.banque-france.fr" class="underline hover:text-gray-600" target="_blank">REGAFI API</a>
			· No data is stored on the server.
		</div>
	</footer> -->
</div>
