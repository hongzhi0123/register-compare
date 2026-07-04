<script lang="ts">
	let dragging = $state(false);
	let fileName = $state<string | null>(null);
	let uploading = $state(false);
	let error = $state<string | null>(null);

	const { onLoaded } = $props<{
		onLoaded: (payload: { datasetId: string; count: number }) => void;
	}>();

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		dragging = true;
	}

	function handleDragLeave() {
		dragging = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		error = null;

		const file = e.dataTransfer?.files?.[0];
		if (file) processFile(file);
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		error = null;
		if (input.files?.[0]) processFile(input.files[0]);
	}

	async function processFile(file: File) {
		if (!file.name.endsWith('.json')) {
			error = 'Veuillez sélectionner un fichier JSON';
			return;
		}

		fileName = file.name;
		uploading = true;
		error = null;

		try {
			const res = await fetch('/api/eba', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: file
			});
			const data = await res.json();

			if (!data.success) {
				throw new Error(data.error || 'Erreur lors du traitement du fichier');
			}

			onLoaded({ datasetId: data.datasetId, count: data.count });
		} catch (e) {
			error = e instanceof Error ? e.message : 'Erreur inconnue';
			fileName = null;
		} finally {
			uploading = false;
		}
	}

	function reset() {
		fileName = null;
		error = null;
	}
</script>

<div
	class="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors"
	class:border-blue-500={dragging}
	class:bg-blue-50={dragging}
	class:border-gray-300={!dragging}
	class:bg-gray-50={!dragging && !fileName}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	onclick={() => document.getElementById('eba-file-input')?.click()}
	role="button"
	tabindex="0"
	onkeydown={(e) => e.key === 'Enter' && document.getElementById('eba-file-input')?.click()}
>
	<input
		id="eba-file-input"
		type="file"
		accept=".json"
		class="hidden"
		onchange={handleFileSelect}
	/>

	{#if uploading}
		<div class="flex flex-col items-center gap-2">
			<svg class="w-10 h-10 text-gray-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
			</svg>
			<p class="text-sm text-gray-600">Upload en cours...</p>
		</div>
	{:else if fileName}
		<div class="flex flex-col items-center gap-2">
			<svg class="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
			</svg>
			<p class="text-sm font-medium text-gray-700">{fileName}</p>
			<p class="text-xs text-gray-500">Cliquez pour changer de fichier</p>
			<button
				class="mt-2 text-xs text-red-600 hover:text-red-800 underline"
				onclick={(e) => { e.stopPropagation(); reset(); }}
			>
				Supprimer
			</button>
		</div>
	{:else}
		<div class="flex flex-col items-center gap-2">
			<svg class="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
			</svg>
			<p class="text-sm text-gray-600">
				Déposez le fichier JSON EBA ici ou <span class="text-blue-600 font-medium">parcourez</span>
			</p>
			<p class="text-xs text-gray-400">Fichier téléchargé depuis euclid.eba.europa.eu/register/pir/registerDownload</p>
		</div>
	{/if}
</div>

{#if error}
	<p class="mt-2 text-sm text-red-600">{error}</p>
{/if}