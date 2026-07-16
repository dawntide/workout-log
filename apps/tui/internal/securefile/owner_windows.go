package securefile

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

func trustedSIDs() ([]*windows.SID, []windows.TRUSTEE_TYPE, error) {
	user, err := windows.GetCurrentProcessToken().GetTokenUser()
	if err != nil {
		return nil, nil, err
	}
	system, err := windows.CreateWellKnownSid(windows.WinLocalSystemSid)
	if err != nil {
		return nil, nil, err
	}
	administrators, err := windows.CreateWellKnownSid(windows.WinBuiltinAdministratorsSid)
	if err != nil {
		return nil, nil, err
	}
	return []*windows.SID{user.User.Sid, system, administrators}, []windows.TRUSTEE_TYPE{
		windows.TRUSTEE_IS_USER,
		windows.TRUSTEE_IS_USER,
		windows.TRUSTEE_IS_GROUP,
	}, nil
}

func restrictOwnerOnly(path string) error {
	sids, trusteeTypes, err := trustedSIDs()
	if err != nil {
		return err
	}
	entries := make([]windows.EXPLICIT_ACCESS, 0, len(sids))
	seen := make(map[string]struct{}, len(sids))
	for i, sid := range sids {
		key := sid.String()
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		entries = append(entries, windows.EXPLICIT_ACCESS{
			AccessPermissions: windows.GENERIC_ALL,
			AccessMode:        windows.GRANT_ACCESS,
			Trustee: windows.TRUSTEE{
				TrusteeForm:  windows.TRUSTEE_IS_SID,
				TrusteeType:  trusteeTypes[i],
				TrusteeValue: windows.TrusteeValueFromSID(sid),
			},
		})
	}
	acl, err := windows.ACLFromEntries(entries, nil)
	if err != nil {
		return err
	}
	return windows.SetNamedSecurityInfo(
		path,
		windows.SE_FILE_OBJECT,
		windows.DACL_SECURITY_INFORMATION|windows.PROTECTED_DACL_SECURITY_INFORMATION,
		nil,
		nil,
		acl,
		nil,
	)
}

func ownerOnly(path string) (bool, error) {
	descriptor, err := windows.GetNamedSecurityInfo(
		path,
		windows.SE_FILE_OBJECT,
		windows.DACL_SECURITY_INFORMATION,
	)
	if err != nil {
		return false, err
	}
	control, _, err := descriptor.Control()
	if err != nil {
		return false, err
	}
	if control&windows.SE_DACL_PROTECTED == 0 {
		return false, nil
	}
	dacl, _, err := descriptor.DACL()
	if err != nil {
		return false, err
	}
	if dacl == nil {
		return false, nil
	}
	sids, _, err := trustedSIDs()
	if err != nil {
		return false, err
	}
	allowed := make(map[string]struct{}, len(sids))
	for _, sid := range sids {
		allowed[sid.String()] = struct{}{}
	}
	if int(dacl.AceCount) != len(allowed) {
		return false, nil
	}
	for i := uint16(0); i < dacl.AceCount; i++ {
		var ace *windows.ACCESS_ALLOWED_ACE
		if err := windows.GetAce(dacl, uint32(i), &ace); err != nil {
			return false, err
		}
		if ace.Header.AceType != windows.ACCESS_ALLOWED_ACE_TYPE {
			return false, nil
		}
		sid := (*windows.SID)(unsafe.Pointer(&ace.SidStart))
		if _, ok := allowed[sid.String()]; !ok {
			return false, nil
		}
	}
	return true, nil
}
