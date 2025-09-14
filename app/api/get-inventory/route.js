import { NextResponse } from 'next/server';

const STEAM_API_KEY = process.env.STEAM_API_KEY;
const CS2_APP_ID = 730;

// Helper to extract the relevant part of the profile URL
function extractIdentifier(url) {
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(part => part);
        if (pathParts[0] && pathParts[1]) {
            // Handles both /id/ and /profiles/
            return pathParts[1];
        }
    } catch (e) {
        // Fallback for non-URL strings or malformed URLs
        return url.split('/').pop();
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
      const escaped = ('' + row[header]).replace(/"/g, '""'); // Escapes double quotes
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

  if (!profileUrl) {
    return NextResponse.json({ message: 'Profile URL is required.' }, { status: 400 });
  }

  try {
    let steamId;
    const identifier = extractIdentifier(profileUrl);

    if (/^\d{17}$/.test(identifier)) {
      steamId = identifier;
    } else if (identifier) {
      const vanityResponse = await fetch(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${STEAM_API_KEY}&vanityurl=${identifier}`);
      const vanityData = await vanityResponse.json();
      
      if (vanityData.response.success !== 1) {
        return NextResponse.json({ message: 'Could not find a Steam ID for this profile URL.' }, { status: 404 });
      }
      steamId = vanityData.response.steamid;
    } else {
      return NextResponse.json({ message: 'Invalid Steam profile URL format.' }, { status: 400 });
    }

    // --- NEW ROBUST METHOD ---
    // STEP 1: Use the more reliable endpoint to get the inventory assets and descriptions.
    // This endpoint can sometimes fail even on public profiles for various reasons (trade bans, etc.)
    const inventoryResponse = await fetch(`https://steamcommunity.com/inventory/${steamId}/${CS2_APP_ID}/2?l=english&count=5000`);

    if (!inventoryResponse.ok) {
        // This will catch 403 Forbidden (private), 404 Not Found, 500 Server Error etc.
        // It's the most common failure point for profiles that appear public but are restricted.
        return NextResponse.json({ message: 'Inventory is private or profile is invalid. (Steam API returned an error)' }, { status: 403 });
    }

    const inventoryData = await inventoryResponse.json();
    
    // Check for a valid response structure from Steam
    if (!inventoryData || !inventoryData.assets || !inventoryData.descriptions) {
      // Sometimes Steam returns a success status but an empty/malformed response.
      return NextResponse.json({ message: 'Could not read inventory data. It might be empty or there is a temporary Steam API issue.' }, { status: 404 });
    }
    
    if (inventoryData.assets.length === 0) {
      return NextResponse.json({ message: 'This inventory is empty.' }, { status: 404 });
    }

    // Create a lookup map for descriptions for efficiency
    const descriptionMap = new Map(inventoryData.descriptions.map(desc => [`${desc.classid}_${desc.instanceid}`, desc]));
    
    const itemsForCSV = inventoryData.assets.map(asset => {
        const description = descriptionMap.get(`${asset.classid}_${asset.instanceid}`);
        return {
            "Item_Name": description?.market_hash_name || "Unknown Item",
            "Type": description?.type || "Unknown",
            "Tradable": description?.tradable ? "Yes" : "No",
            "Marketable": description?.marketable ? "Yes" : "No",
            "Class_ID": asset.classid,
            "Instance_ID": asset.instanceid,
            "Asset_ID": asset.assetid,
        };
    });
    
    const csvData = convertToCSV(itemsForCSV);
    const fileName = `cs2_inventory_${steamId}.csv`;

    return new Response(csvData, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });

  } catch (error) {
    console.error('API Route Error:', error);
    return NextResponse.json({ message: 'An unexpected server error occurred.' }, { status: 500 });
  }
}

