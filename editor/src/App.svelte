<script lang="ts">
  import { onMount } from 'svelte'
  import { createDesign } from './api/client'
  import Editor from './ui/Editor.svelte'
  import Library from './ui/Library.svelte'
  import { hashFor, parseRoute, type Route } from './ui/router'

  let route = $state<Route>(parseRoute(location.hash))
  let busy = $state(false)
  let notice = $state('')

  function open(id: string) {
    notice = ''
    location.hash = hashFor({ name: 'editor', id })
  }

  function backToLibrary(message?: string) {
    notice = message ?? ''
    if (route.name === 'editor') history.back() // the hashchange handler then shows the library
    else location.hash = hashFor({ name: 'library' })
  }

  async function create() {
    busy = true
    notice = ''
    try {
      const created = await createDesign()
      open(created.design.id)
    } catch (e) {
      notice = e instanceof Error ? e.message : String(e)
    } finally {
      busy = false
    }
  }

  onMount(() => {
    const onHash = () => { route = parseRoute(location.hash) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  })
</script>

{#if route.name === 'editor'}
  {#key route.id}
    <Editor designId={route.id} onBack={backToLibrary} />
  {/key}
{:else}
  <!-- A fresh Library each time we arrive, so its list is always reloaded. -->
  <Library onOpen={open} onCreate={create} {busy} {notice} />
{/if}
