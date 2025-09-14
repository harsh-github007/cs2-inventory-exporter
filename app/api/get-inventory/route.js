import { NextResponse } from 'next/server';

const STEAM_API_KEY = process.env.STEAM_API_KEY;

// --- ROBUST HELPER FUNCTION ---
function extractIdentifier(url) {
    try {
        const cleanUrl = url.trim().replace(/\/$/, '');
        const parts = cleanUrl.split('/');
        
        const profilesIndex = parts.indexOf('profiles');
        if (profilesIndex !== -1 && parts.length > profilesIndex + 1) {
            return parts[profilesIndex + 1];
        }
        
        const idIndex = parts.indexOf('id');
        if (idIndex !== -1 && parts.length > idIndex + 1) {
            return parts[idIndex + 1];
        }

        if(parts.length > 0) {
            return parts[parts.length - 1];
        }
    } catch (e) {
        console.error("URL parsing failed:", e);
    }
    return null;
}

// Helper to convert array of objects to CSV string
function convertToCSV(data) {
  if (!data || data.length === 0) return "";
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];
  for (const row of data) {
    const values = headers.map(header => {
      const escaped = ('' + row[header]).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }
  return csvRows.join('\n');
}

// The main API function
export async function POST(request) {
  const { profileUrl } = await request.json();

  if (!STEAM_API_KEY) {
    return NextResponse.json({ message: 'Steam API key is not configured on the server.' }, { status: 500 });
  }

  console.log(`Server is using an API Key ending in: ...${STEAM_API_KEY.slice(-4)}`);

  if (!profileUrl) {
    return NextResponse.json({ message: 'Profile URL is required.' }, { status: 400 });
  }

  try {
    let steamId;
    const identifier = extractIdentifier(profileUrl);

    console.log(`Extracted Identifier: ${identifier}`);

    if (!identifier) {
        return NextResponse.json({ message: 'Could not extract a valid identifier from the URL.' }, { status: 400 });
    }

    if (/^\d{17}$/.test(identifier)) {
      steamId = identifier;
    } else {
      const vanityResponse = await fetch(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${STEAM_API_KEY}&vanityurl=${identifier}`);
      const vanityData = await vanityResponse.json();
      
      if (vanityData.response.success !== 1) {
        return NextResponse.json({ message: `Could not find a Steam ID for this vanity URL: ${identifier}` }, { status: 404 });
      }
      steamId = vanityData.response.steamid;
    }
    
    console.log(`Resolved SteamID: ${steamId}`);

    // --- USING THE OFFICIAL, RELIABLE STEAM WEB API ---
    const officialApiUrl = `https://api.steampowered.com/IEconItems_730/GetPlayerItems/v1/?key=${STEAM_API_KEY}&steamid=${steamId}`;
    console.log(`Requesting official API URL: ${officialApiUrl}`);
    
    const inventoryResponse = await fetch(officialApiUrl);
    
    // Add specific handling for the 410 GONE error.
    if (inventoryResponse.status === 410) {
        console.error('Official Steam API responded with 410 Gone. This is a critical error from Steam\'s side, likely related to the API key or IP blocking.');
        return NextResponse.json({ message: `Steam's API is reporting that the resource is permanently gone (Error 410). This may be an issue with the API key's permissions or a temporary problem on Steam's end.` }, { status: 500 });
    }

    if (!inventoryResponse.ok) {
        console.error(`Official Steam API responded with status: ${inventoryResponse.status} ${inventoryResponse.statusText}`);
        return NextResponse.json({ message: `Failed to fetch from the official Steam API. Status: ${inventoryResponse.status}` }, { status: 500 });
    }

    const inventoryData = await inventoryResponse.json();
    
    if (!inventoryData.result || inventoryData.result.status !== 1) {
        const status = inventoryData.result?.status || 'unknown';
        console.log(`Official API returned logical error status: ${status}`);
        return NextResponse.json({ message: `Inventory is private or profile is invalid. (API Status: ${status})` }, { status: 403 });
    }
    
    const items = inventoryData.result.items;

    if (!items || items.length === 0) {
      return NextResponse.json({ message: 'This inventory is empty.' }, { status: 404 });
    }
    
    // NOTE: This API does NOT provide market_hash_name. The CSV will be more basic.
    const itemsForCSV = items.map(item => {
        return {
            "Item_ID": item.id,
            "Original_ID": item.original_id,
            "Def_Index": item.defindex,
            "Level": item.level,
            "Quality": item.quality,
            "Quantity": item.quantity,
        };
    });

    const csvData = convertToCSV(itemsForCSV);
    const fileName = `cs2_inventory_basic_${steamId}.csv`;

    return new Response(csvData, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });

  } catch (error) {
    console.error('Full API Route Error:', error);
    return NextResponse.json({ message: 'An unexpected server error occurred.', errorDetails: error.message }, { status: 500 });
  }
}

