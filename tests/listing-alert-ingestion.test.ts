import { describe, expect, it } from "vitest";

import {
  createPropertyDraftFromListingCandidate,
  NO_MATCHING_PROPERTY_PHOTO_WARNING,
  NO_PROPERTY_PHOTO_IN_HTML_WARNING,
  parseListingAlertText
} from "@/lib/listing-alerts/listing-alert-parser";
import {
  applyListingCandidateGeographyFilter,
  OUTSIDE_PROFILE_GEOGRAPHY_WARNING
} from "@/lib/listing-alerts/geography-filter";
import {
  clearListingAlertQueue,
  createEmptyListingAlertState,
  createListingAlertSource,
  ingestListingAlertText,
  LISTING_ALERT_STORAGE_KEY,
  loadListingAlertState,
  markListingCandidatesIgnored,
  reprocessListingAlertMessages,
  upsertListingAlertSource
} from "@/lib/listing-alerts/listing-alert-persistence";
import {
  filterAndSortListingCandidates
} from "@/lib/listing-alerts/listing-alert-triage";
import { quietCornerSeedProfile } from "@/lib/profiles/quiet-corner-seed";

const timestamp = "2026-08-10T22:00:00.000Z";

function deterministicIds(prefix = "id") {
  let index = 0;

  return () => `${prefix}-${(index += 1)}`;
}

const alertText = `New listings matching your saved search

287 County Road, Woodstock, CT 06281
$329,900
3 beds 2 baths 1,684 sq ft
5.2 acres
Built in 1978
MLS 24012345
Open fields, barn, pastoral views, private well and septic.
https://example.com/listing/287-county-road

14 Pond View Lane, Stafford, CT 06076
$289,000
2 bd 1.5 ba 1,248 sqft
1.7 acres
Pond view, wooded privacy, oil heat.
https://example.com/listing/14-pond-view-lane`;

function zillowRedirectUrl(zpid: string) {
  const target = `https://www.zillow.com/routing/email/property-notifications/zpid_target/${zpid}_zpid/X1-SSabc_sse/?z&utm_campaign=emo-instantsavedsearch&utm_source=email`;

  return `https://click.mail.zillow.com/f/a/link?target=${encodeURIComponent(
    target
  )}`;
}

const zillowInstantPhotoUrl =
  "https://photos.zillowstatic.com/fp/ec564b89deebd43e77b0f8451df51b36-zui_propcard_lg_1008_528.jpg";
const zillowInstantPhotoThumbUrl =
  "https://photos.zillowstatic.com/fp/ec564b89deebd43e77b0f8451df51b36-zui_propcard_lg_504_264.jpg";
const zillowDigestPhotoUrls = [
  "https://photos.zillowstatic.com/fp/bd2274cfa8e269669925aecbde959d6e-p_e.jpg",
  "https://photos.zillowstatic.com/fp/e60db1b03de7b73c6b0c4936972f2b8b-p_e.jpg"
];
const zillowMlsLogoUrl =
  "https://photos.zillowstatic.com/fp/d79c34cc3fb9c13a4cbe1437a108a1d7-l_c.jpg";
const zillowEscapedJsonPhotoUrl =
  "https://photos.zillowstatic.com/fp/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-p_e.jpg";
const zillowAshworthPhotoUrl =
  "https://photos.zillowstatic.com/fp/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-p_e.jpg";
const zillowJeromePhotoUrl =
  "https://photos.zillowstatic.com/fp/cccccccccccccccccccccccccccccccc-p_e.jpg";
const realtorStaffordPhotoUrl =
  "https://ap.rdcpix.com/fee7f355cbed0ea0a694389feb659eb5l-m4046937172s.jpg";
const realtorEastPhotoUrl =
  "https://ap.rdcpix.com/804a9d1ab2622363f784ffddb59bdb93l-m341779919s.jpg";
const realtorNewCityPhotoUrl =
  "https://ap.rdcpix.com/5bf947cd5b69b518e3fe4ced7dc667a3l-m2252134929od.jpg";
const realtorGreenPhotoUrl =
  "https://ap.rdcpix.com/15greenstreetstaffordct06076l-m2205747253s.jpg";
const realtorHighPhotoUrl =
  "https://ap.rdcpix.com/47highstreetstaffordct06076l-m1112937458s.jpg";

const zillowInstantAlertText = `New Listing: 18 Fiske Hill Rd Sturbridge, MA 01566. Your 'For Sale near Stafford Springs CT 06076' search

Latest results for your For Sale near Stafford Springs CT 06076 search.

============================================================
Zillow (r) -
https://click.mail.zillow.com/f/a/header?target=https%3A%2F%2Fwww.zillow.com%2F%3Futm_campaign%3Demo-instantsavedsearch
============================================================

New listing for sale at $400,000

This home matches your search For Sale near Stafford Springs CT 06076: $500K or less, 2+ Beds, 1+ Baths, and&nbsp;more
https://click.mail.zillow.com/f/a/search?target=https%3A%2F%2Fwww.zillow.com%2Fhomes%2Ffor_sale%2F%3FsearchQueryState%3D%257B%2522price%2522%253A%257B%2522max%2522%253A500000%257D%257D

------------------------------------------------------------
For sale by owner. NEW.

$400,000
3 bd | 2 ba | 1,404 sqft

18 Fiske Hill Rd, Sturbridge, MA

View this listing -
${zillowRedirectUrl("57651702")}

------------------------------------------------------------
Zillow Home Loans (r) -
https://click.mail.zillow.com/f/a/loan?target=https%3A%2F%2Fwww.zillow.com%2Fhomeloans%2Feligibility

Zillow, Inc.
1301 Second Avenue, Floor 36
Seattle, WA 98101

Unsubscribe from this email -
https://click.mail.zillow.com/f/a/unsub?target=https%3A%2F%2Fwww.zillow.com%2Femail%2Funsubscribe`;

const zillowInstantAlertHtml = `<html>
  <body>
    <img src="https://zillowstatic.com/s3/email-statics/images/zui/logo_zillow_lm.png" alt="Zillow" width="134" height="36" />
    <div style="background-image: url('${zillowInstantPhotoThumbUrl}')"></div>
    <img src="${zillowInstantPhotoUrl}" alt="18 Fiske Hill Rd" width="1008" height="528" />
    <img src="${zillowMlsLogoUrl}" alt="MLS Logo" height="23" />
    <img src="https://click.mail.zillow.com/q/tracker" width="1" height="1" />
  </body>
</html>`;

const zillowDigestAlertText = `Daily results straight to your inbox.

Zillow (r) -
https://click.mail.zillow.com/f/a/header?target=https%3A%2F%2Fwww.zillow.com%2F

For Sale near Stafford Springs CT 06076 -

$500K or less, 2+ Beds, 1+ Baths...

For sale. NEW.
$419,000
3 bd | 2 ba | 2,056 sqft
289 Morgan St, South Hadley, MA

View this listing -
${zillowRedirectUrl("11111111")}

For sale.
$369,000 | Price cut: $10K (8/10)
3 bd | 1 ba | 982 sqft
50 Phelps St, Easthampton, MA

View this listing -
${zillowRedirectUrl("22222222")}

Zillow Home Loans (r) -
https://click.mail.zillow.com/f/a/loan?target=https%3A%2F%2Fwww.zillow.com%2Fhomeloans%2Feligibility

Zillow, Inc.
1301 Second Avenue, Floor 36
Seattle, WA 98101`;

const zillowDigestAlertHtml = `<html>
  <body>
    <img src="https://zillowstatic.com/s3/email-statics/images/Zillow_Logo_300x64.png" alt="Zillow" />
    <img src="${zillowDigestPhotoUrls[0]}" alt="289 Morgan St" />
    <img src="${zillowDigestPhotoUrls[0]}" alt="289 Morgan St duplicate" />
    <a href="${zillowRedirectUrl("11111111")}">View this listing</a>
    <img src="${zillowDigestPhotoUrls[1]}" alt="50 Phelps St" />
    <a href="${zillowRedirectUrl("22222222")}">View this listing</a>
    <img src="https://www.zillowstatic.com/bedrock/app/uploads/sites/36/2024/03/icon_house.png" alt="House Icon" />
  </body>
</html>`;

describe("listing alert ingestion", () => {
  it("extracts listing candidates from saved-search alert text", () => {
    const result = parseListingAlertText(alertText, {
      timestamp,
      createId: deterministicIds("fact")
    });

    expect(result.warnings).toEqual([]);
    expect(result.candidates).toHaveLength(2);

    const first = result.candidates[0];
    expect(first?.addressLine1).toBe("287 County Road");
    expect(first?.city).toBe("Woodstock");
    expect(first?.state).toBe("CT");
    expect(first?.askingPrice).toBe(329900);
    expect(first?.bedrooms).toBe(3);
    expect(first?.bathrooms).toBe(2);
    expect(first?.livingSqft).toBe(1684);
    expect(first?.lotAcres).toBe(5.2);
    expect(first?.yearBuilt).toBe(1978);
    expect(first?.mlsId).toBe("24012345");
    expect(first?.rawText).not.toContain("14 Pond View Lane");
    expect(first?.facts.map((fact) => fact.factKey)).toEqual(
      expect.arrayContaining([
        "setting.open_fields_pastoral",
        "setting.horse_property",
        "utility.well",
        "utility.septic"
      ])
    );
  });

  it("extracts a Zillow instant alert without creating URL-only candidates", () => {
    const result = parseListingAlertText(zillowInstantAlertText, {
      timestamp,
      createId: deterministicIds("fact"),
      bodyHtml: zillowInstantAlertHtml
    });

    expect(result.warnings).toEqual([]);
    expect(result.candidates).toHaveLength(1);

    const candidate = result.candidates[0];
    expect(candidate?.addressLine1).toBe("18 Fiske Hill Rd");
    expect(candidate?.city).toBe("Sturbridge");
    expect(candidate?.state).toBe("MA");
    expect(candidate?.postalCode).toBe("01566");
    expect(candidate?.askingPrice).toBe(400000);
    expect(candidate?.bedrooms).toBe(3);
    expect(candidate?.bathrooms).toBe(2);
    expect(candidate?.livingSqft).toBe(1404);
    expect(candidate?.listingUrl).toContain("57651702_zpid");
    expect(candidate?.primaryPhotoUrl).toBe(zillowInstantPhotoUrl);
    expect(candidate?.photoUrls).toEqual([zillowInstantPhotoUrl]);
    expect(candidate?.warnings).toEqual([]);
  });

  it("extracts Zillow daily digest cards and ignores saved-search criteria", () => {
    const result = parseListingAlertText(zillowDigestAlertText, {
      timestamp,
      createId: deterministicIds("fact"),
      bodyHtml: zillowDigestAlertHtml
    });

    expect(result.warnings).toEqual([]);
    expect(result.candidates).toHaveLength(2);
    expect(
      result.candidates.map((candidate) => candidate.addressLine1)
    ).toEqual(["289 Morgan St", "50 Phelps St"]);
    expect(result.candidates.map((candidate) => candidate.askingPrice)).toEqual(
      [419000, 369000]
    );
    expect(result.candidates.map((candidate) => candidate.bedrooms)).toEqual([
      3, 3
    ]);
    expect(result.candidates.map((candidate) => candidate.bathrooms)).toEqual([
      2, 1
    ]);
    expect(result.candidates.map((candidate) => candidate.primaryPhotoUrl)).toEqual(
      zillowDigestPhotoUrls
    );
  });

  it("extracts escaped Zillow photo URLs from alert HTML", () => {
    const escapedPhotoUrl = zillowEscapedJsonPhotoUrl.replace(/\//g, "\\/");
    const result = parseListingAlertText(zillowInstantAlertText, {
      timestamp,
      createId: deterministicIds("fact"),
      bodyHtml: `<html><body><script>
        {"address":"18 Fiske Hill Rd","imageUrl":"${escapedPhotoUrl}"}
      </script></body></html>`
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.primaryPhotoUrl).toBe(
      zillowEscapedJsonPhotoUrl
    );
    expect(result.candidates[0]?.warnings).toEqual([]);
  });

  it("matches Zillow photos to candidates by nearby address context", () => {
    const result = parseListingAlertText(
      `Daily results straight to your inbox.

For sale. NEW.
$300,000
3 bd | 1 ba | 1,232 sqft
58 Ashworth Street, Manchester, CT 06040
View this listing -
${zillowRedirectUrl("33333333")}

For sale. NEW.
$430,000
4 bd | 2 ba | 3,769 sqft
12 Jerome Avenue, Bloomfield, CT 06002
View this listing -
${zillowRedirectUrl("44444444")}`,
      {
        timestamp,
        createId: deterministicIds("fact"),
        bodyHtml: `<html><body>
          <img src="${zillowJeromePhotoUrl}" alt="12 Jerome Avenue" />
          <img src="${zillowAshworthPhotoUrl}" alt="58 Ashworth Street" />
        </body></html>`
      }
    );

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]?.addressLine1).toBe("58 Ashworth Street");
    expect(result.candidates[0]?.primaryPhotoUrl).toBe(zillowAshworthPhotoUrl);
    expect(result.candidates[1]?.addressLine1).toBe("12 Jerome Avenue");
    expect(result.candidates[1]?.primaryPhotoUrl).toBe(zillowJeromePhotoUrl);
  });

  it("extracts and matches Realtor photos from alert HTML", () => {
    const result = parseListingAlertText(
      `Price dropped to $142,900: 365 East St

175 W Stafford Rd, Stafford, CT 06076
3 bd 3 ba 1,799 sqft
https://www.realtor.com/realestateandhomes-detail/175-W-Stafford-Rd_Stafford_CT_06076_M12345

365 East St, Stafford, CT 06076
4 bd 2 ba 1,359 sqft
https://www.realtor.com/realestateandhomes-detail/365-East-St_Stafford_CT_06076_M67890

24 New City Rd, Stafford, CT 06076
7 bd 3 ba 2,820 sqft
https://www.realtor.com/realestateandhomes-detail/24-New-City-Rd_Stafford_CT_06076_M54321`,
      {
        timestamp,
        createId: deterministicIds("fact"),
        bodyHtml: `<html><body>
          <article>
            <h2>365 East St, Stafford, CT 06076</h2>
            <div class="photo-wrap">
              <img src="${realtorEastPhotoUrl}" />
            </div>
            <p>For sale</p>
            <strong>$142,900</strong>
          </article>
          <article>
            <h2>24 New City Rd, Stafford, CT 06076</h2>
            <div class="photo-wrap">
              <img src="${realtorNewCityPhotoUrl}" />
            </div>
            <p>For sale</p>
            <strong>&#36;182,000</strong>
          </article>
          <article>
            <h2>175 W Stafford Rd, Stafford, CT 06076</h2>
            <div class="photo-wrap">
              <img src="${realtorStaffordPhotoUrl}" />
            </div>
            <p>For sale</p>
            <strong>$275,000</strong>
          </article>
        </body></html>`
      }
    );

    expect(result.candidates).toHaveLength(3);
    expect(result.candidates.map((candidate) => candidate.primaryPhotoUrl)).toEqual(
      [realtorStaffordPhotoUrl, realtorEastPhotoUrl, realtorNewCityPhotoUrl]
    );
    expect(result.candidates.map((candidate) => candidate.askingPrice)).toEqual([
      275000,
      142900,
      182000
    ]);
    expect(
      result.candidates.every(
        (candidate) =>
          !candidate.warnings.includes(NO_PROPERTY_PHOTO_IN_HTML_WARNING)
      )
    ).toBe(true);
  });

  it("keeps Realtor image-first card prices and photos with the correct address", () => {
    const result = parseListingAlertText(
      `Just sold: 7 Stafford Hts

15 Green St, Stafford, CT 06076
7 bed 3 bath 3,092 sqft
https://www.realtor.com/realestateandhomes-detail/15-Green-St_Stafford_CT_06076_M11111

175 W Stafford Rd, Stafford, CT 06076
3 bed 3 bath 1,799 sqft
https://www.realtor.com/realestateandhomes-detail/175-W-Stafford-Rd_Stafford_CT_06076_M22222

47 High St, Stafford, CT 06076
3 bed 2 bath 2,112 sqft
https://www.realtor.com/realestateandhomes-detail/47-High-St_Stafford_CT_06076_M33333`,
      {
        timestamp,
        createId: deterministicIds("fact"),
        bodyHtml: `<html><body>
          <article>
            <div class="photo-wrap"><img src="${realtorGreenPhotoUrl}" /></div>
            <p>For sale</p>
            <strong>$424,000</strong>
            <p>7 bed 3 bath 3,092 sqft</p>
            <p>15 Green St</p>
            <p>Stafford, CT 06076</p>
          </article>
          <article>
            <div class="photo-wrap"><img src="${realtorStaffordPhotoUrl}" /></div>
            <p>For sale</p>
            <strong>$275,000</strong>
            <p>3 bed 3 bath 1,799 sqft</p>
            <p>175 W Stafford Rd</p>
            <p>Stafford, CT 06076</p>
          </article>
          <article>
            <div class="photo-wrap"><img src="${realtorHighPhotoUrl}" /></div>
            <p>For sale</p>
            <strong>$315,000</strong>
            <p>3 bed 2 bath 2,112 sqft</p>
            <p>47 High St</p>
            <p>Stafford, CT 06076</p>
          </article>
        </body></html>`
      }
    );

    expect(result.candidates).toHaveLength(3);
    expect(result.candidates.map((candidate) => candidate.addressLine1)).toEqual([
      "15 Green St",
      "175 W Stafford Rd",
      "47 High St"
    ]);
    expect(result.candidates.map((candidate) => candidate.primaryPhotoUrl)).toEqual(
      [realtorGreenPhotoUrl, realtorStaffordPhotoUrl, realtorHighPhotoUrl]
    );
    expect(result.candidates.map((candidate) => candidate.askingPrice)).toEqual([
      424000,
      275000,
      315000
    ]);
  });

  it("keeps Realtor two-column image rows aligned with their detail columns", () => {
    const result = parseListingAlertText(
      `Just sold: 7 Stafford Hts

175 W Stafford Rd, Stafford, CT 06076
3 bed 3 bath 1,799 sqft
https://www.realtor.com/realestateandhomes-detail/175-W-Stafford-Rd_Stafford_CT_06076_M22222

47 High St, Stafford, CT 06076
3 bed 2 bath 2,112 sqft
https://www.realtor.com/realestateandhomes-detail/47-High-St_Stafford_CT_06076_M33333`,
      {
        timestamp,
        createId: deterministicIds("fact"),
        bodyHtml: `<html><body>
          <table>
            <tr>
              <td><img src="${realtorStaffordPhotoUrl}" /></td>
              <td><img src="${realtorHighPhotoUrl}" /></td>
            </tr>
            <tr>
              <td>
                <p>For sale</p>
                <strong>$275,000</strong>
                <p>3 bed 3 bath 1,799 sqft</p>
                <p>175 W Stafford Rd</p>
                <p>Stafford, CT 06076</p>
              </td>
              <td>
                <p>For sale</p>
                <strong>$315,000</strong>
                <p>3 bed 2 bath 2,112 sqft</p>
                <p>47 High St</p>
                <p>Stafford, CT 06076</p>
              </td>
            </tr>
          </table>`
      }
    );

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((candidate) => candidate.primaryPhotoUrl)).toEqual(
      [realtorStaffordPhotoUrl, realtorHighPhotoUrl]
    );
    expect(result.candidates.map((candidate) => candidate.askingPrice)).toEqual([
      275000,
      315000
    ]);
  });

  it("matches Realtor photo cards by shared tracking URL when image context omits address", () => {
    const sharedTrackingUrl =
      "https://e.e.mail.realtor.com/c2/1946:source:d260818:user:run/f54e0392?jwtH=header&jwtP=payload&jwtS=signature#app";
    const result = parseListingAlertText(
      `Price dropped to $250,000: 175 W Stafford Rd

[${realtorHighPhotoUrl}]${sharedTrackingUrl}
For sale
$315,000
${sharedTrackingUrl}$10,000
3 bed 2 bath 2,112 sqft
${sharedTrackingUrl}47
High St
Stafford, CT 06076
${sharedTrackingUrl}View
listing

47 High St, Stafford, CT 06076
3 bed 2 bath 2,112 sqft
[${sharedTrackingUrl}]47 High St`,
      {
        timestamp,
        createId: deterministicIds("fact"),
        bodyHtml: `<html><body>
          <table>
            <tr>
              <td>
                <a href="${sharedTrackingUrl}">
                  <img src="${realtorHighPhotoUrl}" />
                </a>
              </td>
            </tr>
            <tr>
              <td><a href="${sharedTrackingUrl}">$315,000</a></td>
            </tr>
            <tr>
              <td><a href="${sharedTrackingUrl}">47 High St<br>Stafford, CT 06076</a></td>
            </tr>
          </table>
        </body></html>`
      }
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.addressLine1).toBe("47 High St");
    expect(result.candidates[0]?.askingPrice).toBe(315000);
    expect(result.candidates[0]?.primaryPhotoUrl).toBe(realtorHighPhotoUrl);
    expect(result.candidates[0]?.listingUrl).toBe(sharedTrackingUrl);
  });

  it("separates Realtor photo URLs from pipe-delimited click URLs", () => {
    const sharedTrackingUrl =
      "https://e.e.mail.realtor.com/c2/1946:source:d260818:user:run/f10e982db52b1657c2eeb5a8c7e6210el-m2007430695rd-w640_h480?jwtH=header&jwtP=payload&jwtS=signature";
    const result = parseListingAlertText(
      `Price dropped to $250,000: 175 W Stafford Rd

${realtorStaffordPhotoUrl}|${sharedTrackingUrl}
For sale
$250,000
3 bed 3 bath 1,799 sqft
175 W Stafford Rd
Stafford, CT 06076
View listing`,
      {
        timestamp,
        createId: deterministicIds("fact")
      }
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.addressLine1).toBe("175 W Stafford Rd");
    expect(result.candidates[0]?.askingPrice).toBe(250000);
    expect(result.candidates[0]?.primaryPhotoUrl).toBe(realtorStaffordPhotoUrl);
    expect(result.candidates[0]?.listingUrl).toBe(sharedTrackingUrl);
    expect(result.candidates[0]?.listingUrl).not.toContain("rdcpix.com");
  });

  it("keeps order fallback when Realtor multi-photo HTML has no address context", () => {
    const result = parseListingAlertText(
      `Just sold: 7 Stafford Hts

175 W Stafford Rd, Stafford, CT 06076
3 bed 3 bath 1,799 sqft
https://www.realtor.com/realestateandhomes-detail/175-W-Stafford-Rd_Stafford_CT_06076_M22222

47 High St, Stafford, CT 06076
3 bed 2 bath 2,112 sqft
https://www.realtor.com/realestateandhomes-detail/47-High-St_Stafford_CT_06076_M33333`,
      {
        timestamp,
        createId: deterministicIds("fact"),
        bodyHtml: `<html><body>
          <img src="${realtorStaffordPhotoUrl}" />
          <img src="https://ap.rdcpix.com/d4f8fcb45a9c4c129fe8edb723999a77l-m1112937458s.jpg" />
        </body></html>`
      }
    );

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((candidate) => candidate.primaryPhotoUrl)).toEqual(
      [
        realtorStaffordPhotoUrl,
        "https://ap.rdcpix.com/d4f8fcb45a9c4c129fe8edb723999a77l-m1112937458s.jpg"
      ]
    );
    expect(
      result.candidates.every((candidate) =>
        !candidate.warnings.includes(NO_MATCHING_PROPERTY_PHOTO_WARNING)
      )
    ).toBe(true);
  });

  it("does not match a Realtor photo using only shared town and postal code", () => {
    const result = parseListingAlertText(
      `Just sold: 7 Stafford Hts

47 High St, Stafford, CT 06076
3 bed 2 bath 2,112 sqft
https://www.realtor.com/realestateandhomes-detail/47-High-St_Stafford_CT_06076_M33333`,
      {
        timestamp,
        createId: deterministicIds("fact"),
        bodyHtml: `<html><body>
          <article>
            <img src="${realtorStaffordPhotoUrl}" />
            <p>For sale</p>
            <strong>$275,000</strong>
            <p>3 bed 3 bath 1,799 sqft</p>
            <p>175 W Stafford Rd</p>
            <p>Stafford, CT 06076</p>
          </article>
        </body></html>`
      }
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.addressLine1).toBe("47 High St");
    expect(result.candidates[0]?.primaryPhotoUrl).toBe("");
    expect(result.candidates[0]?.askingPrice).toBeNull();
    expect(result.candidates[0]?.warnings).toContain(
      NO_MATCHING_PROPERTY_PHOTO_WARNING
    );
  });

  it("explains when alert HTML has no property photo URL", () => {
    const result = parseListingAlertText(zillowInstantAlertText, {
      timestamp,
      createId: deterministicIds("fact"),
      bodyHtml: `<html><body>
        <img src="https://zillowstatic.com/s3/email-statics/images/zui/logo_zillow_lm.png" alt="Zillow" />
      </body></html>`
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.primaryPhotoUrl).toBe("");
    expect(result.candidates[0]?.warnings).toContain(
      NO_PROPERTY_PHOTO_IN_HTML_WARNING
    );
  });

  it("filters and sorts listing candidates for queue triage", () => {
    const source = createListingAlertSource(
      {
        id: "source-triage",
        name: "Zillow Alerts"
      },
      timestamp,
      deterministicIds("source")
    );
    const initialState = upsertListingAlertSource(
      createEmptyListingAlertState(),
      source,
      timestamp
    );
    const ingested = ingestListingAlertText(
      initialState,
      source.id,
      {
        externalMessageId: "message-triage",
        subject: "Daily digest",
        from: "Zillow <instant-updates@mail.zillow.com>",
        receivedAt: timestamp,
        bodyText: zillowDigestAlertText,
        bodyHtml: zillowDigestAlertHtml
      },
      timestamp,
      deterministicIds("triage")
    );
    const photoCandidates = filterAndSortListingCandidates({
      state: ingested.state,
      selectedSourceId: source.id,
      statusFilter: "new",
      triageFilter: "has_photo",
      sortMode: "price_asc",
      activeProfile: null
    });
    const missingPhotoCandidates = filterAndSortListingCandidates({
      state: ingested.state,
      selectedSourceId: source.id,
      statusFilter: "new",
      triageFilter: "missing_photo",
      sortMode: "received_desc",
      activeProfile: null
    });
    const scoredCandidates = filterAndSortListingCandidates({
      state: ingested.state,
      selectedSourceId: source.id,
      statusFilter: "new",
      triageFilter: "all",
      sortMode: "score_desc",
      activeProfile: quietCornerSeedProfile
    });

    expect(photoCandidates.candidates.map((candidate) => candidate.addressLine1))
      .toEqual(["50 Phelps St", "289 Morgan St"]);
    expect(missingPhotoCandidates.candidates).toHaveLength(0);
    expect(scoredCandidates.scorePreviews.size).toBe(2);
    expect(
      scoredCandidates.candidates.every((candidate) =>
        scoredCandidates.scorePreviews.has(candidate.id)
      )
    ).toBe(true);
  });

  it("marks multiple visible candidates ignored in one state update", () => {
    const source = createListingAlertSource(
      {
        id: "source-batch-ignore",
        name: "Zillow Alerts"
      },
      timestamp,
      deterministicIds("source")
    );
    const initialState = upsertListingAlertSource(
      createEmptyListingAlertState(),
      source,
      timestamp
    );
    const ingested = ingestListingAlertText(
      initialState,
      source.id,
      {
        externalMessageId: "message-batch-ignore",
        subject: "Daily digest",
        from: "Zillow <instant-updates@mail.zillow.com>",
        receivedAt: timestamp,
        bodyText: zillowDigestAlertText,
        bodyHtml: zillowDigestAlertHtml
      },
      timestamp,
      deterministicIds("batch-ignore")
    );
    const ignored = markListingCandidatesIgnored(
      ingested.state,
      ingested.state.candidates.map((candidate) => candidate.id),
      timestamp
    );

    expect(ignored.candidates).toHaveLength(2);
    expect(ignored.candidates.map((candidate) => candidate.status)).toEqual([
      "ignored",
      "ignored"
    ]);
  });

  it("creates an editable property draft without manually entering fields", () => {
    const result = parseListingAlertText(zillowInstantAlertText, {
      timestamp,
      createId: deterministicIds("fact"),
      bodyHtml: zillowInstantAlertHtml
    });
    const candidate = result.candidates[0];

    expect(candidate).toBeDefined();

    const property = createPropertyDraftFromListingCandidate(
      candidate!,
      timestamp,
      deterministicIds("property")
    );

    expect(property.addressLine1).toBe("18 Fiske Hill Rd");
    expect(property.city).toBe("Sturbridge");
    expect(property.listingUrl).toContain("57651702_zpid");
    expect(property.primaryPhotoUrl).toBe(zillowInstantPhotoUrl);
    expect(property.photoUrls).toEqual([zillowInstantPhotoUrl]);
    expect(property.askingPrice).toBe(400000);
    expect(property.listingRemarks).toContain("For sale by owner");
    expect(property.facts.every((fact) => fact.sourceType === "listing")).toBe(
      true
    );
    expect(property.facts.every((fact) => fact.verified === false)).toBe(true);
  });

  it("deduplicates repeated alerts by listing identity", () => {
    const source = createListingAlertSource(
      {
        id: "source-1",
        name: "Saved Search Alerts"
      },
      timestamp,
      deterministicIds("source")
    );
    const initialState = upsertListingAlertSource(
      createEmptyListingAlertState(),
      source,
      timestamp
    );
    const firstRun = ingestListingAlertText(
      initialState,
      source.id,
      {
        externalMessageId: "message-1",
        subject: "First alert",
        from: "alerts@example.com",
        receivedAt: timestamp,
        bodyText: alertText
      },
      timestamp,
      deterministicIds("first")
    );
    const secondRun = ingestListingAlertText(
      firstRun.state,
      source.id,
      {
        externalMessageId: "message-2",
        subject: "Second alert",
        from: "alerts@example.com",
        receivedAt: timestamp,
        bodyText: alertText
      },
      timestamp,
      deterministicIds("second")
    );

    expect(firstRun.run.candidatesCreated).toBe(2);
    expect(secondRun.run.candidatesCreated).toBe(0);
    expect(secondRun.run.candidatesUpdated).toBe(2);
    expect(secondRun.state.candidates).toHaveLength(2);
    expect(secondRun.state.messages).toHaveLength(2);
  });

  it("does not create duplicate candidates from Realtor price-drop fragments", () => {
    const realtorPriceDropText = `Price dropped to $142,900: 365 East St

This listing just decreased by $7,100 in your Stafford saved search
https://www.realtor.com/saved-search/stafford-ct?cid=price-change

Saved Search: Stafford, CT, Less than $450K, 2+ Beds
https://www.realtor.com/realestateandhomes-search/Stafford_CT

365 East St, Stafford, CT 06076
$142,900
4 bd 2 ba 1,359 sqft
https://www.realtor.com/realestateandhomes-detail/365-East-St_Stafford_CT_06076_M12345

365 East St, Stafford, CT 06076
Price dropped to $142,900
4 bd 2 ba 1,359 sqft
https://www.realtor.com/realestateandhomes-detail/365-East-St_Stafford_CT_06076_M12345?cid=listing-card`;

    const result = parseListingAlertText(realtorPriceDropText, {
      bodyHtml: `<html><body>
        <article>
          <h2>365 East St, Stafford, CT 06076</h2>
          <img src="${realtorEastPhotoUrl}" />
        </article>
      </body></html>`
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.addressLine1).toBe("365 East St");
    expect(result.candidates[0]?.city).toBe("Stafford");
    expect(result.candidates[0]?.askingPrice).toBe(142900);
    expect(result.candidates[0]?.bedrooms).toBe(4);
    expect(result.candidates[0]?.bathrooms).toBe(2);
    expect(result.candidates[0]?.livingSqft).toBe(1359);
    expect(result.candidates[0]?.primaryPhotoUrl).toBe(realtorEastPhotoUrl);
  });

  it("preserves known Realtor price and photo when a later alert omits them", () => {
    const source = createListingAlertSource(
      {
        id: "source-preserve-known",
        name: "Saved Search Alerts"
      },
      timestamp,
      deterministicIds("source")
    );
    const initialState = upsertListingAlertSource(
      createEmptyListingAlertState(),
      source,
      timestamp
    );
    const firstRun = ingestListingAlertText(
      initialState,
      source.id,
      {
        externalMessageId: "message-with-photo",
        subject: "Price dropped to $250,000: 175 W Stafford Rd",
        from: '"realtor.com" <info@notifications.realtor.com>',
        receivedAt: "2026-08-18T16:09:54.000Z",
        bodyText: `Price dropped to $250,000: 175 W Stafford Rd

175 W Stafford Rd, Stafford, CT 06076
$250,000
3 bed 3 bath 1,799 sqft
https://www.realtor.com/realestateandhomes-detail/175-W-Stafford-Rd_Stafford_CT_06076_M22222`,
        bodyHtml: `<html><body>
          <article>
            <img src="${realtorStaffordPhotoUrl}" />
            <strong>$250,000</strong>
            <p>175 W Stafford Rd</p>
            <p>Stafford, CT 06076</p>
          </article>
        </body></html>`
      },
      "2026-08-18T16:09:54.000Z",
      deterministicIds("first")
    );
    const secondRun = ingestListingAlertText(
      firstRun.state,
      source.id,
      {
        externalMessageId: "message-without-photo",
        subject: "Just sold: 62 West St",
        from: '"realtor.com" <info@notifications.realtor.com>',
        receivedAt: "2026-08-19T12:54:20.000Z",
        bodyText: `Just sold: 62 West St

175 W Stafford Rd, Stafford, CT 06076
3 bed 3 bath 1,799 sqft
https://www.realtor.com/realestateandhomes-detail/175-W-Stafford-Rd_Stafford_CT_06076_M22222`
      },
      "2026-08-19T12:54:20.000Z",
      deterministicIds("second")
    );
    const candidate = secondRun.state.candidates.find(
      (item) => item.addressLine1.replace(/\s+/g, " ") === "175 W Stafford Rd"
    );

    expect(secondRun.run.candidatesCreated).toBe(0);
    expect(secondRun.run.candidatesUpdated).toBe(1);
    expect(candidate?.askingPrice).toBe(250000);
    expect(candidate?.primaryPhotoUrl).toBe(realtorStaffordPhotoUrl);
    expect(candidate?.warnings).not.toContain(NO_MATCHING_PROPERTY_PHOTO_WARNING);
    expect(candidate?.warnings).not.toContain("No asking price found.");
  });

  it("reprocesses stored messages without advancing the mailbox cursor", () => {
    const cursorTimestamp = "2026-08-11T00:00:00.000Z";
    const reprocessTimestamp = "2026-08-11T01:00:00.000Z";
    const source = createListingAlertSource(
      {
        id: "source-reprocess",
        name: "Saved Search Alerts",
        lastCheckedAt: cursorTimestamp
      },
      timestamp,
      deterministicIds("source")
    );
    const initialState = upsertListingAlertSource(
      createEmptyListingAlertState(),
      source,
      timestamp
    );
    const ingested = ingestListingAlertText(
      initialState,
      source.id,
      {
        externalMessageId: "message-reprocess",
        subject: "Stored alert",
        from: "alerts@example.com",
        receivedAt: timestamp,
        bodyText: alertText
      },
      timestamp,
      deterministicIds("ingest")
    );
    const stateWithCursor = {
      ...ingested.state,
      sources: ingested.state.sources.map((item) =>
        item.id === source.id
          ? {
              ...item,
              lastCheckedAt: cursorTimestamp,
              updatedAt: cursorTimestamp
            }
          : item
      )
    };
    const reprocessed = reprocessListingAlertMessages(
      stateWithCursor,
      source.id,
      reprocessTimestamp,
      deterministicIds("reprocess")
    );

    expect(reprocessed.messagesProcessed).toBe(1);
    expect(reprocessed.candidatesCreated).toBe(0);
    expect(reprocessed.candidatesUpdated).toBe(2);
    expect(reprocessed.run?.messagesSeen).toBe(1);
    expect(reprocessed.state.sources[0]?.lastCheckedAt).toBe(cursorTimestamp);
    expect(reprocessed.state.candidates).toHaveLength(2);
  });

  it("removes stale source candidates that are not emitted during reprocess", () => {
    const source = createListingAlertSource(
      {
        id: "source-stale",
        name: "Saved Search Alerts"
      },
      timestamp,
      deterministicIds("source")
    );
    const initialState = upsertListingAlertSource(
      createEmptyListingAlertState(),
      source,
      timestamp
    );
    const ingested = ingestListingAlertText(
      initialState,
      source.id,
      {
        externalMessageId: "message-stale",
        subject: "Stored alert",
        from: "alerts@example.com",
        receivedAt: timestamp,
        bodyText: alertText
      },
      timestamp,
      deterministicIds("ingest")
    );
    const staleCandidate = {
      ...ingested.state.candidates[0]!,
      id: "stale-candidate",
      listingUrl: "https://www.realtor.com/saved-search/stafford-ct",
      mlsId: "just",
      addressLine1: "",
      city: "",
      state: "",
      postalCode: "",
      askingPrice: null,
      bedrooms: null,
      bathrooms: null,
      livingSqft: null,
      lotAcres: null,
      yearBuilt: null,
      listingRemarks: "This listing just decreased by $7,100.",
      rawText: "This listing just decreased by $7,100.",
      facts: [],
      warnings: ["No address or town found.", "No asking price found."]
    };

    const reprocessed = reprocessListingAlertMessages(
      {
        ...ingested.state,
        candidates: [staleCandidate, ...ingested.state.candidates]
      },
      source.id,
      "2026-08-11T01:00:00.000Z",
      deterministicIds("reprocess")
    );

    expect(reprocessed.state.candidates).toHaveLength(2);
    expect(
      reprocessed.state.candidates.some(
        (candidate) => candidate.id === staleCandidate.id
      )
    ).toBe(false);
  });

  it("uses the alert subject when the message body omits the address", () => {
    const source = createListingAlertSource(
      {
        id: "source-subject",
        name: "Zillow Alerts"
      },
      timestamp,
      deterministicIds("source")
    );
    const initialState = upsertListingAlertSource(
      createEmptyListingAlertState(),
      source,
      timestamp
    );
    const result = ingestListingAlertText(
      initialState,
      source.id,
      {
        externalMessageId: "message-subject",
        subject:
          "New Listing: 18 Fiske Hill Rd Sturbridge, MA 01566. Your search",
        from: "Zillow <instant-updates@mail.zillow.com>",
        receivedAt: timestamp,
        bodyText: `For sale by owner. NEW.
$400,000
3 bd | 2 ba | 1,404 sqft
View this listing -
${zillowRedirectUrl("57651702")}`,
        bodyHtml: zillowInstantAlertHtml
      },
      timestamp,
      deterministicIds("subject")
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.addressLine1).toBe("18 Fiske Hill Rd");
    expect(result.candidates[0]?.postalCode).toBe("01566");
    expect(result.candidates[0]?.warnings).not.toContain(
      "No address or town found."
    );
    expect(result.candidates[0]?.primaryPhotoUrl).toBe(zillowInstantPhotoUrl);
  });

  it("ignores new candidates outside the active profile geography", () => {
    const source = createListingAlertSource(
      {
        id: "source-geography",
        name: "Zillow Alerts"
      },
      timestamp,
      deterministicIds("source")
    );
    const initialState = upsertListingAlertSource(
      createEmptyListingAlertState(),
      source,
      timestamp
    );
    const result = ingestListingAlertText(
      initialState,
      source.id,
      {
        externalMessageId: "message-geography",
        subject: "Mixed geography alert",
        from: "Zillow <instant-updates@mail.zillow.com>",
        receivedAt: timestamp,
        bodyText: `New listings matching your saved search

15 Main Street, Stafford Springs, CT 06076
$299,000
3 bd | 2 ba | 1,420 sqft
View this listing -
https://example.com/stafford-springs

58 Ashworth Street, Manchester, CT 06040
$300,000
3 bd | 1 ba | 1,232 sqft
View this listing -
https://example.com/manchester`
      },
      timestamp,
      deterministicIds("geography")
    );
    const filtered = applyListingCandidateGeographyFilter(
      result.state,
      quietCornerSeedProfile,
      timestamp
    );
    const stafford = filtered.state.candidates.find(
      (candidate) => candidate.addressLine1 === "15 Main Street"
    );
    const manchester = filtered.state.candidates.find(
      (candidate) => candidate.addressLine1 === "58 Ashworth Street"
    );

    expect(filtered.ignoredCount).toBe(1);
    expect(stafford?.city).toBe("Stafford Springs");
    expect(stafford?.status).toBe("new");
    expect(manchester?.city).toBe("Manchester");
    expect(manchester?.status).toBe("ignored");
    expect(manchester?.warnings).toContain(
      OUTSIDE_PROFILE_GEOGRAPHY_WARNING
    );
  });

  it("clears the queue without removing source configuration", () => {
    const source = createListingAlertSource(
      {
        id: "source-clear",
        name: "MilestoneSW Listing Alerts",
        provider: "imap_mailbox",
        connectorConfig: {
          gmailAccountHint: "",
          imapHost: "mail.example.com",
          imapPort: 993,
          imapSecurity: "ssl_tls",
          imapUsername: "alerts@example.com",
          imapMailbox: "INBOX",
          credentialEnvVar: "REA_LISTING_ALERT_IMAP_PASSWORD"
        }
      },
      timestamp,
      deterministicIds("source")
    );
    const initialState = upsertListingAlertSource(
      createEmptyListingAlertState(),
      source,
      timestamp
    );
    const ingested = ingestListingAlertText(
      initialState,
      source.id,
      {
        externalMessageId: "message-clear",
        subject: "Alert",
        from: "alerts@example.com",
        receivedAt: timestamp,
        bodyText: alertText
      },
      timestamp,
      deterministicIds("clear")
    );
    const cleared = clearListingAlertQueue(ingested.state);

    expect(cleared.sources).toHaveLength(1);
    expect(cleared.sources[0]?.connectorConfig.imapHost).toBe(
      "mail.example.com"
    );
    expect(cleared.candidates).toHaveLength(0);
    expect(cleared.messages).toHaveLength(0);
    expect(cleared.runs).toHaveLength(0);
  });

  it("stores IMAP connector settings without storing a password", () => {
    const source = createListingAlertSource(
      {
        id: "source-imap",
        name: "MilestoneSW Listing Alerts",
        provider: "imap_mailbox",
        connectorConfig: {
          gmailAccountHint: "",
          imapHost: "mail.example.com",
          imapPort: 993,
          imapSecurity: "ssl_tls",
          imapUsername: "alerts@example.com",
          imapMailbox: "INBOX",
          credentialEnvVar: "REA_LISTING_ALERT_IMAP_PASSWORD"
        }
      },
      timestamp,
      deterministicIds("source")
    );

    expect(source.connectorConfig.imapHost).toBe("mail.example.com");
    expect(source.connectorConfig.imapPort).toBe(993);
    expect(source.connectorConfig.imapSecurity).toBe("ssl_tls");
    expect(source.connectorConfig.credentialEnvVar).toBe(
      "REA_LISTING_ALERT_IMAP_PASSWORD"
    );
    expect(Object.keys(source.connectorConfig)).not.toContain("password");
    expect(Object.keys(source.connectorConfig)).not.toContain("imapPassword");
  });

  it("backfills connector defaults for older saved alert sources", () => {
    const source = createListingAlertSource(
      {
        id: "source-legacy",
        name: "Legacy Alerts"
      },
      timestamp,
      deterministicIds("source")
    );
    const legacySource: Record<string, unknown> = { ...source };
    delete legacySource.connectorConfig;
    const storage = {
      getItem: (key: string) =>
        key === LISTING_ALERT_STORAGE_KEY
          ? JSON.stringify({
              schemaVersion: 1,
              sources: [legacySource],
              messages: [],
              candidates: [],
              runs: []
            })
          : null,
      setItem: () => undefined
    };

    const result = loadListingAlertState(storage);

    expect(result.source).toBe("storage");
    expect(result.state.sources[0]?.connectorConfig.imapPort).toBe(993);
    expect(result.state.sources[0]?.connectorConfig.imapMailbox).toBe("INBOX");
  });
});
