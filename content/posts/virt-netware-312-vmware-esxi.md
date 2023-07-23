---
title: "Virtualisieren eines Novell Netware 3.12 Servers auf VMware ESXi"
tags: ["netware", "vmware", "virtualisierung"]
date: 2011-01-01T23:54:30+01:00
draft: false
---

Warum sollte man einen Novell Netware 3.12 Server nicht auch in eine Viruelle Maschine umziehen? Weil dann die betagte Hardware nicht mehr kaputtgehen kann. Leider wird ein so betagtes Betriebssystem nicht mehr von VMware so ohne weiteres unterstützt.

Hier meine Anleitung, wie ein bestehender Novell Netware 3.12 Server in VMware ESXi 4.1 virtualisiert werden kann:

- Erstellen eines Disk-Images der bestehenden Server-Festplatte mit [Clonezilla](https://clonezilla.org) auf einen bestehenden anderen Netzwerk-Server. Daran denken, dass evtl. bereits eingebaute uralte CD-ROM Laufwerke keine aktuellen CD-Rohlinge mehr lesen können und ein aktuelles Laufwerk angeschlossen werden muss.
- Anlegen einer neuen benutzerdefinierten VM in VMware:
  - VM Version 7
  - 1 CPU
  - 128 MB RAM
  - Netzwerkadapter: Flexibel
  - Disketten-Laufwerk
  - CD-ROM Laufwerk
  - SCSI-Controller Buslogic Parallel
  - Virtuelle SCSI Festplatte ein wenig größer wie die bestehende Festplatte

    ---
    **NOTE**

    Wichtig ist die Netzwerkadapter-Einstellung auf `Flexibel`, damit der Netware Treiber dann auch die Karte findet:

    ![Einstellungen der VM](/images/posts/virt-netware-312-vmware-esxi/netware-vm-einstellungen.png)

    ---

- Booten der neuen VM mit dem [Clonezilla](https://clonezilla.org)-CD(-Image) und zurücksichern des zuvor angelegten Festplatten-Images.

- Meine unten angehängte erstellte [virtuelle Diskette `netware.flp`](/images/posts/virt-netware-312-vmware-esxi/netware.flp_.zip) ins virtuelle Diskettenlaufwerk legen, die VM von Festplatte ins DOS mit Umgehung der `AUTOEXEC.BAT` booten (SHIFT halten!) und die auf der Diskette enthaltenen Dateien

    ```batch
    BLMM3.DDI
    BLMM3.HAM
    NW4-IDLE.NLM
    PCNTNW.LAN
    PCNTNW.LDI
    SCSIHD.CDM
    SCSIHD.DDI
    ```

ins Verzeichnis `C:\SERVER.312` kopieren (`CD SERVER.312; COPY A:\*.*`)

- Die `STARTUP.NCF` um den Buslogic Treiber **`BLMM3`** ergänzen:

    ```batch
    LOAD C:\SERVER.312\PM312.NLM
    LOAD C:\SERVER.312\312PTD\NATIVE\START\NPAPATCH
    PMLOAD C:\SERVER.312\312PTD\NATIVE\START
    SET AUTO REGISTER MEMORY ABOVE 16 MED = OFF
    SET RESERVED BUFFERS BELOW 16 MEG = 200
    LOAD MMATTRFX
    LOAD NBI31X
    LOAD NWPALOAD
    LOAD BLMM3
    SET MINIMUM PACKET RECEIVE BUFFERS = 100
    ```

    ![STARTUP.NCF](/images/posts/virt-netware-312-vmware-esxi/startup-ncf.png)

- Starten von Netware durch Eingabe von Server und `AUTOEXEC.NCF` um die AMD Netzwerktreiber und `NW4-IDLE` ergänzen dann

    `LOAD INSTALL → SYSTEM OPTIONS → EDIT AUTOEXEC.NCF`

    ```batch
    FILE SERVER NAME NETNAME
    IPX INTERNAL NET 13
    LOAD C:\SERVER.312\NW4-IDLE
    LOAD CONLOG
    LOAD NBI31X
    LOAD C:\SERVER.312\PCNTNW SLOT=3 FRAME=ETHERNET_802.3 NAME=ETH0
    BIND IPX ETH0 NET=01031991
    LOAD APPLETLK NET=55000 ZONE={"Server"}
    LOAD C:\SERVER.312\PCNTNW SLOT=3 FRAME=ETHERNET_SNAP NAME=ESNAP
    BIND APPLETLK ESNAP NET=100-1001 ZONE={"Drucker"}
    LOAD AFTER312
    LOAD NPA311
    LOAD REMOTE HELLO
    LOAD RSPX
    LOAD KEYB GERMANY
    MOUNT VOL1
    MOUNT VOL2
    LOAD MONITOR /P
    LOAD AFP
    ```

    ![AUTOEXEC.NCF](/images/posts/virt-netware-312-vmware-esxi/autoexec-ncf2.png)

- Neu starten und geniessen. Das Hauptproblem des Ganzen ist es, die für VMware zueinander passenden Festplatten und Buslogic-SCSI Treibers zu finden: Der Buslogic Netware 4.1 Treiber stammt vom [Archiv des Insight BBS](http://bbs.actapricot.org/files/area37/) und die SCSIHD Treiber von der Original Netware 4.1 Installations-CD, die aber alle prima unter Netware 3.1 funktionieren.

    ![Monitor](/images/posts/virt-netware-312-vmware-esxi/monitor.jpg)

## Folgende Artikel waren hierbei hilfreich

- [Installation eines neuen virtuellen Netware 3.12 mit IDE Festplatte](http://www.vmts.net/article/installnovell.htm) (ein Klassiker)

- [Moving Netware 3.12 to VMware virtual machine](http://epsilon.eu.org/epsilon/index.php/eng/Computers/Moving-Netware-3.12-to-VMware-virtual-machine) (aktuellere Details zu den AMD Netzwerktreibern)

- [VMware Communities: Working Netware 3.12 buslogic driver?](http://communities.vmware.com/message/486961) (welcher SCSIHD Treiber)
