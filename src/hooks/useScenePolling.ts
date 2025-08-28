import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export function useScenePolling() {
  async function pollScene(sceneId: string, onUpdate: (s: any) => void) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) throw new Error('Not signed in')

    let attempts = 0
    const maxAttempts = 60 // ~3 minutes at 3s intervals

    return new Promise((resolve, reject) => {
      const timer = setInterval(async () => {
        attempts++
        try {
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/luma-scene-status?sceneId=${sceneId}`,
            { headers: { Authorization: `Bearer ${token}` } }
          )
          const json = await res.json()
          onUpdate?.(json)

          if (json.status === 'completed') {
            clearInterval(timer)
            return resolve(json)
          }
          if (json.status === 'failed' || attempts >= maxAttempts) {
            clearInterval(timer)
            return reject(json)
          }
        } catch (e) {
          clearInterval(timer)
          reject(e)
        }
      }, 3000)
    })
  }

  return { pollScene }
}
await pollScene(sceneId, (update) => { /* update UI */ })
