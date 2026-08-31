// api/slack-upload.js
// Item #5: auto-post the shrink report PDF to #jellyland-inventory right after a
// report is generated. Uses Slack's 3-step file upload flow — same pattern as
// the other Jellyland reporting bots (files.getUploadURLExternal -> upload ->
// files.completeUploadExternal) — because a plain incoming webhook can only
// post text/blocks, it can't attach an actual uploadable file.

const SLACK_API = 'https://slack.com/api'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = process.env.SLACK_BOT_TOKEN
  const channelId = process.env.SLACK_JELLYLAND_INVENTORY_CHANNEL
  if (!token || !channelId) {
    return res.status(500).json({ error: 'Slack credentials not configured (SLACK_BOT_TOKEN / SLACK_JELLYLAND_INVENTORY_CHANNEL)' })
  }

  const { filename, pdfBase64, initialComment } = req.body
  if (!filename || !pdfBase64) return res.status(400).json({ error: 'filename and pdfBase64 are required' })

  try {
    const fileBuffer = Buffer.from(pdfBase64, 'base64')

    // Step 1 — get an upload URL + file ID
    const step1 = await fetch(`${SLACK_API}/files.getUploadURLExternal`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ filename, length: String(fileBuffer.length) }),
    })
    const step1Data = await step1.json()
    if (!step1Data.ok) throw new Error(`getUploadURLExternal failed: ${step1Data.error}`)
    const { upload_url, file_id } = step1Data

    // Step 2 — upload the raw bytes to that URL
    const form = new FormData()
    form.append('file', new Blob([fileBuffer], { type: 'application/pdf' }), filename)
    const step2 = await fetch(upload_url, { method: 'POST', body: form })
    if (!step2.ok) throw new Error(`File upload failed: HTTP ${step2.status}`)

    // Step 3 — complete the upload, attaching it to the channel with a comment
    const step3 = await fetch(`${SLACK_API}/files.completeUploadExternal`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: [{ id: file_id, title: filename }],
        channel_id: channelId,
        initial_comment: initialComment || '',
      }),
    })
    const step3Data = await step3.json()
    if (!step3Data.ok) throw new Error(`completeUploadExternal failed: ${step3Data.error}`)

    return res.status(200).json({ success: true, fileId: file_id })
  } catch (err) {
    console.error('Slack upload error:', err)
    return res.status(500).json({ error: err.message })
  }
}
