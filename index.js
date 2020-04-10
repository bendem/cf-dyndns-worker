addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const API = 'https://api.cloudflare.com/client/v4';

function response(obj) {
  return new Response(JSON.stringify(obj), {
    headers: {
      'content-type': 'application/json'
    }
  })
}

async function handleUpdate(ip, existingRecord) {
  if (ip && existingRecord) {
    if (existingRecord.content === ip) {
      return;
    }
    console.log(`updating record from ${existingRecord.content} to ${ip}`);
    // UPDATE
  } else if (ip && !existingRecord) {
    // CREATE
    const cfResponse = await fetch(`${API}/zones/${CF_ZONE}/dns_records`, {
      method: 'POST',
      headers: {
        'authorization': 'Bearer ' + CF_TOKEN,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: 'A',
        name: DOMAIN,
        content: ip,
        ttl: 1,
        proxied: true,
      })
    });
    console.log(`creating record with ${ip}`, await cfResponse.json());
  } else if (!ip && existingRecord) {
    // DELETE
    console.log(`deleting record`);
  } else {
    console.log('doing nothing', ip, existingRecord, DOMAIN)
  }
}

/**
 * Respond with hello worker text
 * @param {Request} request
 */
async function handleRequest(request) {
  const params = new URL(request.url).searchParams
  // https://<url>?ipv4=<ipaddr>&ipv6=<ip6addr>&password=<pass>
  const ipv4 = params.get('ipv4')
  const ipv6 = params.get('ipv6')
  const password = params.get('password')

  if (password !== PASSWORD) {
    return response({ success: false, errors: ['invalid password'] });
  }

  const cfResponse = await fetch(`${API}/zones/${CF_ZONE}/dns_records`, {
    headers: {
      'authorization': 'Bearer ' + CF_TOKEN
    },
  });

  const cfResponseObject = await cfResponse.json();

  if (cfResponseObject.success !== true) {
    return response({ success: false, errors: cfResponseObject.errors });
  }

  let existing4Record = null;
  let existing6Record = null;
  for (const record of cfResponseObject.result) {
    if (record.name !== DOMAIN) {
      continue;
    }

    if (record.type === 'A') {
      existing4Record = record;
    } else if (record.type === 'AAAA') {
      existing6Record = record;
    }
  }

  console.log(cfResponseObject);

  await handleUpdate(ipv4, existing4Record);
  await handleUpdate(ipv6, existing6Record);


  return response({ success: true })
}
