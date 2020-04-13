addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request))
})

const API = 'https://api.cloudflare.com/client/v4'

function response(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    headers: {
      'content-type': 'application/json',
    },
    status,
  })
}

async function dnsRecords(url, method, body = null) {
  return await fetch(`${API}/zones/${CF_ZONE}/${url}`, {
    method,
    headers: {
      authorization: 'Bearer ' + CF_TOKEN,
      'content-type': 'application/json',
    },
    body: body === null ? null : JSON.stringify(body),
  })
}

async function handleUpdate(type, ip, existingRecord) {
  let cfResponse = null
  if (ip && existingRecord) {
    if (existingRecord.content === ip) {
      return
    }

    // UPDATE
    console.log(`updating record from ${existingRecord.content} to ${ip}`)
    cfResponse = await dnsRecords(`dns_records/${existingRecord.id}`, 'PATCH', {
      content: ip,
    })
  } else if (ip && !existingRecord) {
    // CREATE
    console.log(`creating record with ${ip}`)
    cfResponse = await dnsRecords(`dns_records`, 'POST', {
      type,
      name: DOMAIN,
      content: ip,
      ttl: 1,
      proxied: true,
    })
  } else if (!ip && existingRecord) {
    // DELETE
    console.log(`deleting record`)
    cfResponse = await dnsRecords(`dns_records/${existingRecord.id}`, 'DELETE')
  } else {
    console.log('doing nothing', ip, existingRecord, DOMAIN)
  }

  if (!cfResponse) {
    return
  }

  const cfResponseObject = await cfResponse.json()
  console.log(cfResponseObject)
  if (cfResponseObject.success !== true) {
    return cfResponseObject.errors
  }
}

async function handleRequest(request) {
  const requestUrl = new URL(request.url)
  if (requestUrl.pathname === '/current-ip') {
    return response({
      ip: request.headers.get('cf-connecting-ip'),
    })
  }

  if (requestUrl.pathname !== '/dyndns') {
    return response(
      {
        success: false,
      },
      404,
    )
  }

  const params = requestUrl.searchParams
  // https://<url>?ipv4=<ipaddr>&ipv6=<ip6addr>&password=<pass>
  const ipv4 = params.get('ipv4')
  const ipv6 = params.get('ipv6')
  const password = params.get('password')

  if (password !== PASSWORD) {
    return response({ success: false, errors: ['invalid password'] }, 401)
  }

  const cfResponse = await fetch(`${API}/zones/${CF_ZONE}/dns_records`, {
    headers: {
      authorization: 'Bearer ' + CF_TOKEN,
    },
  })

  const cfResponseObject = await cfResponse.json()

  if (cfResponseObject.success !== true) {
    return response({ success: false, errors: cfResponseObject.errors })
  }

  let existing4Record = null
  let existing6Record = null
  for (const record of cfResponseObject.result) {
    if (record.name !== DOMAIN) {
      continue
    }

    if (record.type === 'A') {
      existing4Record = record
    } else if (record.type === 'AAAA') {
      existing6Record = record
    }
  }

  console.log(cfResponseObject)

  const v4Errors = await handleUpdate('A', ipv4, existing4Record)
  const v6Errors = await handleUpdate('AAAA', ipv6, existing6Record)

  const errors = {}
  let success = true
  if (v4Errors) {
    success = false
    errors.ipv4 = v4Errors
  }
  if (v6Errors) {
    success = false
    errors.ipv6 = v6Errors
  }

  return response({ success, errors })
}
