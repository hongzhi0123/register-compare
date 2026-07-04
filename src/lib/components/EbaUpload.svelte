<script lang="ts">
	let error = $state<string | null>(null);
	let fileInput: HTMLInputElement | null = null;

	const { onLoaded } = $props<{
		onLoaded: (payload: { datasetId: string; count: number; sortKey: 'siren' }) => void;
	}>();

	function openPicker() {
		fileInput?.click();
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		error = null;
		if (input.files?.[0]) {
			void processFile(input.files[0]);
		}
		input.value = '';
	}

	async function processFile(file: File) {
		if (!file.name.endsWith('.json')) {
			error = 'Veuillez sélectionner un fichier JSON';
			return;
		}

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

			onLoaded({ datasetId: data.datasetId, count: data.count, sortKey: 'siren' });
		} catch (e) {
			error = e instanceof Error ? e.message : 'Erreur inconnue';
		}
	}
</script>

<div>
	<input
		id="eba-file-input"
		bind:this={fileInput}
		type="file"
		accept=".json"
		class="hidden"
		onchange={handleFileSelect}
	/>

	<button type="button" class="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700" onclick={openPicker}>
		Importer le JSON
	</button>
</div>

{#if error}
	<p class="mt-2 text-sm text-red-600">{error}</p>
{/if}