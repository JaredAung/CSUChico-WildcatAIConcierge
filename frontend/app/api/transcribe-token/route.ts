import { NextResponse } from 'next/server'
import { SignatureV4 } from '@smithy/signature-v4'
import { Sha256 } from '@aws-crypto/sha256-js'
import { HttpRequest } from '@smithy/protocol-http'
import { formatUrl } from '@aws-sdk/util-format-url'

const VALID_LANGUAGES = ['en-US', 'es-US', 'zh-CN', 'tl-PH', 'vi-VN'] as const
type LanguageCode = (typeof VALID_LANGUAGES)[number]

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const languageParam = searchParams.get('language') || 'auto'

    const region = process.env.AWS_REGION || 'us-west-2'
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

    if (!accessKeyId || !secretAccessKey) {
      console.error('Missing AWS credentials for Transcribe token generation')
      return NextResponse.json(
        { error: 'Transcription service temporarily unavailable.' },
        { status: 500 },
      )
    }

    // Build query parameters for Transcribe Streaming WebSocket
    const queryParams: Record<string, string> = {
      'media-encoding': 'pcm',
      'sample-rate': '16000',
    }

    if (languageParam === 'auto') {
      queryParams['identify-multiple-languages'] = 'true'
      queryParams['language-options'] = 'en-US,es-US,zh-CN,tl-PH,vi-VN'
    } else if (VALID_LANGUAGES.includes(languageParam as LanguageCode)) {
      queryParams['language-code'] = languageParam
    } else {
      queryParams['identify-multiple-languages'] = 'true'
      queryParams['language-options'] = 'en-US,es-US,zh-CN,tl-PH,vi-VN'
    }

    // Construct the HTTP request for SigV4 signing
    const endpoint = `transcribestreaming.${region}.amazonaws.com`
    const httpRequest = new HttpRequest({
      method: 'GET',
      protocol: 'wss:',
      hostname: endpoint,
      port: 8443,
      path: '/stream-transcription-websocket',
      query: queryParams,
      headers: {
        host: `${endpoint}:8443`,
      },
    })

    // Sign with SigV4
    const signer = new SignatureV4({
      credentials: {
        accessKeyId,
        secretAccessKey,
        ...(process.env.AWS_SESSION_TOKEN
          ? { sessionToken: process.env.AWS_SESSION_TOKEN }
          : {}),
      },
      region,
      service: 'transcribe',
      sha256: Sha256,
    })

    const signedRequest = await signer.presign(httpRequest, {
      expiresIn: 60,
    })

    const presignedUrl = formatUrl(signedRequest)
    const expiresAt = new Date(Date.now() + 60 * 1000).toISOString()

    return NextResponse.json({
      url: presignedUrl,
      expires_at: expiresAt,
    })
  } catch (err) {
    console.error('Failed to generate Transcribe pre-signed URL:', err)
    return NextResponse.json(
      { error: 'Transcription service temporarily unavailable.' },
      { status: 500 },
    )
  }
}
