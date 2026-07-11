<script lang="ts">
	let error = $state<string | null>(null);
	let fileInput: HTMLInputElement | null = null;
	let uploadInProgress = $state(false);
	let uploadProgress = $state<number | null>(null);
	let uploadStatus = $state('');

	const { sourceId, sourceName, accentColor, uploadFormats, onLoaded } = $props<{
		sourceId: string;
		sourceName: string;
		accentColor: string;
		uploadFormats: Array<'json' | 'csv'>;
		onLoaded: (payload: { datasetId: string; count: number; sortKey: string }) => void;
	}>();

	const colorClasses: Record<string, { bg: string; hover: string; ring: string }> = {
		blue: { bg: 'bg-blue-600', hover: 'hover:bg-blue-700', ring: 'border-blue-600' },
		red: { bg: 'bg-red-600', hover: 'hover:bg-red-700', ring: 'border-red-600' },
		green: { bg: 'bg-green-600', hover: 'hover:bg-green-700', ring: 'border-green-600' },
		amber: { bg: 'bg-amber-600', hover: 'hover:bg-amber-700', ring: 'border-amber-600' },
		purple: { bg: 'bg-purple-600', hover: 'hover:bg-purple-700', ring: 'border-purple-600' }
	};

	const color = $derived(colorClasses[accentColor] ?? colorClasses.blue);

	function getAcceptString(): string {
		const parts: string[] = [];
		if (uploadFormats.includes('json')) parts.push('.json');
		if (uploadFormats.includes('csv')) parts.push('.csv');
		return parts.join(',');
	}

	function uploadFile(file: File): Promise<{ success: boolean; datasetId?: string; count?: number; error?: string }> {
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open('POST', `/api/sources/${sourceId}`);

			if (file.name.endsWith('.json')) {
				xhr.setRequestHeader('Content-Type', 'application/json');
			} else {
				xhr.setRequestHeader('Content-Type', 'text/csv');
			}

			xhr.upload.onprogress = (event) => {
				if (!event.lengthComputable) {
					uploadProgress = null;
					uploadStatus = `Uploading file...`;
					return;
				}
				uploadProgress = Math.round((event.loaded / event.total) * 100);
				uploadStatus = `Uploading file... ${uploadProgress}%`;
			};

			xhr.onerror = () => reject(new Error('Network error during upload'));
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
					reject(new Error('Invalid server response'));
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
		const ext = file.name.split('.').pop()?.toLowerCase();
		if (!uploadFormats.includes(ext as 'json' | 'csv')) {
			error = `Unsupported format. Accepted: ${uploadFormats.join(', ').toUpperCase()}`;
			return;
		}

		error = null;
		uploadInProgress = true;
		uploadProgress = 0;
		uploadStatus = 'Preparing upload...';

		try {
			const data = await uploadFile(file);
			uploadProgress = null;
			uploadStatus = 'Processing on server...';

			if (!data.success) {
				throw new Error(data.error || 'Error processing file');
			}

			onLoaded({ datasetId: data.datasetId!, count: data.count!, sortKey: 'siren' });
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			uploadInProgress = false;
			uploadProgress = null;
			uploadStatus = '';
		}
	}
</script>

<div>
	<input
		id="source-file-input-{sourceId}"
		bind:this={fileInput}
		type="file"
		accept={getAcceptString()}
		class="hidden"
		onchange={handleFileSelect}
	/>

	<button
		type="button"
		class="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-white {color.bg} {color.hover}"
		onclick={openPicker}
	>
		Import {uploadFormats.map(f => f.toUpperCase()).join('/')}
	</button>
</div>

{#if error}
	<p class="mt-2 text-sm text-red-600">{error}</p>
{/if}

{#if uploadInProgress}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
		<div class="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
			<div class="flex items-start gap-3">
				<div class="mt-0.5 h-6 w-6 animate-spin rounded-full border-2 border-gray-300 {`border-t-${accentColor}-600`}"></div>
				<div class="flex-1">
					<h3 class="text-base font-semibold text-gray-900">Import {sourceName}</h3>
					<p class="mt-1 text-sm text-gray-600">{uploadStatus}</p>
					<div class="mt-4 h-2 overflow-hidden rounded-full bg-gray-200">
						{#if uploadProgress === null}
							<div class="h-full w-1/3 animate-pulse rounded-full {color.bg}"></div>
						{:else}
							<div
								class="h-full rounded-full {color.bg} transition-[width] duration-200"
								style={`width: ${Math.max(uploadProgress, 8)}%`}
							></div>
						{/if}
					</div>
					<p class="mt-2 text-xs text-gray-500">
						{#if uploadProgress === null}
							File is being processed...
						{:else}
							{uploadProgress}% uploaded
						{/if}
					</p>
				</div>
			</div>
		</div>
	</div>
{/if}
