<script lang="ts">
	let error = $state<string | null>(null);
	let fileInput: HTMLInputElement | null = null;
	let uploadInProgress = $state(false);
	let uploadProgress = $state<number | null>(null);
	let uploadStatus = $state('');

	const { onLoaded } = $props<{
		onLoaded: (payload: { datasetId: string; count: number; sortKey: 'siren' }) => void;
	}>();

	function uploadJsonFile(file: File): Promise<{ success: boolean; datasetId?: string; count?: number; error?: string }> {
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open('POST', '/api/eba');
			xhr.setRequestHeader('Content-Type', 'application/json');

			xhr.upload.onprogress = (event) => {
				if (!event.lengthComputable) {
					uploadProgress = null;
					uploadStatus = 'Envoi du fichier JSON...';
					return;
				}

				uploadProgress = Math.round((event.loaded / event.total) * 100);
				uploadStatus = `Envoi du fichier JSON... ${uploadProgress}%`;
			};

			xhr.onerror = () => reject(new Error('Erreur réseau pendant le téléversement'));
			xhr.onload = () => {
				try {
					const data = JSON.parse(xhr.responseText) as {
						success: boolean;
						datasetId?: string;
						count?: number;
						error?: string;
					};
					resolve(data);
				} catch {
					reject(new Error('Réponse serveur invalide'));
				}
			};

			xhr.send(file);
		});
	}

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
		uploadInProgress = true;
		uploadProgress = 0;
		uploadStatus = 'Préparation du téléversement...';

		try {
			const data = await uploadJsonFile(file);
			uploadProgress = null;
			uploadStatus = 'Traitement du fichier côté serveur...';

			if (!data.success) {
				throw new Error(data.error || 'Erreur lors du traitement du fichier');
			}

			onLoaded({ datasetId: data.datasetId, count: data.count, sortKey: 'siren' });
		} catch (e) {
			error = e instanceof Error ? e.message : 'Erreur inconnue';
		} finally {
			uploadInProgress = false;
			uploadProgress = null;
			uploadStatus = '';
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

{#if uploadInProgress}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
		<div class="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
			<div class="flex items-start gap-3">
				<div class="mt-0.5 h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"></div>
				<div class="flex-1">
					<h3 class="text-base font-semibold text-gray-900">Import du fichier EBA</h3>
					<p class="mt-1 text-sm text-gray-600">{uploadStatus}</p>
					<div class="mt-4 h-2 overflow-hidden rounded-full bg-gray-200">
						{#if uploadProgress === null}
							<div class="h-full w-1/3 animate-pulse rounded-full bg-blue-600"></div>
						{:else}
							<div
								class="h-full rounded-full bg-blue-600 transition-[width] duration-200"
								style={`width: ${Math.max(uploadProgress, 8)}%`}
							></div>
						{/if}
					</div>
					<p class="mt-2 text-xs text-gray-500">
						{#if uploadProgress === null}
							Le fichier est en cours de traitement.
						{:else}
							{uploadProgress}% envoyé
						{/if}
					</p>
				</div>
			</div>
		</div>
	</div>
{/if}