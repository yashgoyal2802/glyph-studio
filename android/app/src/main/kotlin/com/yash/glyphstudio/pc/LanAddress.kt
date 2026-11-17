package com.yash.glyphstudio.pc

import java.net.Inet4Address
import java.net.NetworkInterface

/** One network address of the phone, as the system reports it. */
data class NetAddress(val interfaceName: String, val host: String, val isUp: Boolean = true)

/** Finds the address a PC on the same Wi-Fi (or on the phone's own hotspot) can reach. Null when there is none. */
object LanAddress {
    private val PREFERRED = listOf("wlan", "ap", "swlan", "wifi", "eth")

    /** Private IPv4 ranges only: 10/8, 172.16/12, 192.168/16. Mobile data, VPN and loopback addresses never match. */
    fun isPrivate(host: String): Boolean {
        val p = host.split('.').mapNotNull { it.toIntOrNull() }
        if (p.size != 4 || p.any { it !in 0..255 }) return false
        return p[0] == 10 || (p[0] == 172 && p[1] in 16..31) || (p[0] == 192 && p[1] == 168)
    }

    fun pick(all: List<NetAddress>): String? {
        val usable = all.filter { it.isUp && isPrivate(it.host) }
        for (prefix in PREFERRED) usable.firstOrNull { it.interfaceName.startsWith(prefix) }?.let { return it.host }
        return null
    }

    fun systemAddresses(): List<NetAddress> = try {
        NetworkInterface.getNetworkInterfaces().toList().flatMap { nif ->
            if (!nif.isUp || nif.isLoopback) emptyList()
            else nif.inetAddresses.toList().filterIsInstance<Inet4Address>().map { NetAddress(nif.name, it.hostAddress ?: "") }
        }
    } catch (_: Exception) {
        emptyList()
    }

    fun find(): String? = pick(systemAddresses())
}
