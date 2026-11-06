# Original IPA common web asset evidence

The existing `original-artifact-before-upload.json` receipt now retains a strictly typed common WWW SHA256 map after original IPA archive identity, signature, certificate, provisioning and every packaged web asset have been reverified. It adds no archive members and performs no additional Apple request, key read, rebuild or signature operation.

Fields: `commonWwwProofScope` is `ORIGINAL_SIGNED_IPA_WWW_ONLY`; `commonWwwAssetSha256` contains every common WWW relative path and lowercase SHA256; `commonWwwFileCount` is its exact count. `commonWwwManifestSha256` hashes UTF-8 `json.dumps(core,sort_keys=True,separators=(',',':'))`, where core contains schemaVersion=1, sourceCommit, sourceTree, ipaSha256 and www.

Only safe relative ASCII asset paths and SHA256 values are exported. No unrelated source metadata, profile, snapshot, user record or credential is copied into these fields. Existing original receipt fields remain present; original intake evidence ZIP membership is unchanged. The frozen successful-intake validator checks required receipt fields and pins entire original member bytes, so these additional proof fields require no validator relaxation.

The coordinator will authenticate the successful original intake run/job/artifact and compare this complete map with the actual final Android AAB common web assets. A manifest from a synthetic native test bootstrap is not a release package proof.

Local synthetic validation: 216 Node controls, 165 archive controls (including seven new manifest safety/identity controls), 30 web-asset controls, 4 certificate controls and 8 release-notes controls passed. Real original IPA comparison remains required in the first accepted intake execution. No store upload or audience change was performed by these local checks.
