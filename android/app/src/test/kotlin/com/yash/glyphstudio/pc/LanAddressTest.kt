package com.yash.glyphstudio.pc

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LanAddressTest {
    @Test fun privateRanges() {
        for (ok in listOf("10.0.0.5", "192.168.29.224", "172.16.0.1", "172.31.255.1")) assertTrue(ok, LanAddress.isPrivate(ok))
        for (bad in listOf("8.8.8.8", "172.32.0.1", "172.15.0.1", "127.0.0.1", "169.254.1.1", "100.64.0.1", "192.169.1.1", "1.2.3", "a.b.c.d", "300.1.1.1", "")) {
            assertFalse(bad, LanAddress.isPrivate(bad))
        }
    }

    @Test fun picksTheWifiAddress() {
        val all = listOf(
            NetAddress("rmnet_data1", "10.20.30.40"), // mobile data: private-looking but not Wi-Fi
            NetAddress("wlan0", "192.168.29.224"),
        )
        assertEquals("192.168.29.224", LanAddress.pick(all))
    }

    @Test fun usesTheHotspotWhenThePhoneIsTheHotspot() {
        assertEquals("192.168.43.1", LanAddress.pick(listOf(NetAddress("rmnet_data1", "10.1.1.1"), NetAddress("ap0", "192.168.43.1"))))
    }

    @Test fun prefersWlanOverOtherInterfaces() {
        assertEquals("192.168.1.9", LanAddress.pick(listOf(NetAddress("ap0", "192.168.43.1"), NetAddress("wlan0", "192.168.1.9"))))
    }

    @Test fun noWifiMeansNoAddress() {
        assertNull(LanAddress.pick(emptyList()))
        assertNull(LanAddress.pick(listOf(NetAddress("rmnet_data1", "10.20.30.40"), NetAddress("tun0", "10.8.0.2"))))
        assertNull(LanAddress.pick(listOf(NetAddress("wlan0", "192.168.1.9", isUp = false))))
        assertNull(LanAddress.pick(listOf(NetAddress("wlan0", "8.8.8.8"))))
    }
}
