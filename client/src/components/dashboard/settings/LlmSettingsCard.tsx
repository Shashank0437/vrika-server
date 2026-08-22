"use client";

import { useEffect, useRef, useState } from "react";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import { ApiError, api } from "@/lib/api";
import { SettingsBadge, SettingsCard, SettingsStatus } from "./SettingsCard";
import type {
  FetchModelsOut,
  LlmProviderType,
  LlmSettingsOut,
  ModelOption,
  TestLlmConnectionOut,
} from "./types";

/**
 * Authentic Official Brand SVG Logos for AI Providers
 */
export function OpenRouterLogo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-label="OpenRouter Logo">
      <path
        d="M18.654 3.87a5.087 5.087 0 110 10.174L23.7 19.09c.64.641.187 1.737-.72 1.737H8.48a8.479 8.479 0 010-16.958h10.175zM8.479 7.26a5.087 5.087 0 100 10.176 5.087 5.087 0 000-10.175z"
        fill="#C8FF00"
      />
    </svg>
  );
}

export function OpenAILogo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="#10A37F" className={className} aria-label="OpenAI Logo">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.607 1.5-2.602-1.5z" />
    </svg>
  );
}

export function AnthropicLogo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1200 1200" fill="none" className={className} aria-label="Anthropic Claude Logo">
      <path
        fill="#D97757"
        d="M 233.959793 800.214905 L 468.644287 668.536987 L 472.590637 657.100647 L 468.644287 650.738403 L 457.208069 650.738403 L 417.986633 648.322144 L 283.892639 644.69812 L 167.597321 639.865845 L 54.926208 633.825623 L 26.577238 627.785339 L 3.3e-05 592.751709 L 2.73832 575.27533 L 26.577238 559.248352 L 60.724873 562.228149 L 136.187973 567.382629 L 249.422867 575.194763 L 331.570496 580.026978 L 453.261841 592.671082 L 472.590637 592.671082 L 475.328857 584.859009 L 468.724915 580.026978 L 463.570557 575.194763 L 346.389313 495.785217 L 219.543671 411.865906 L 153.100723 363.543762 L 117.181267 339.060425 L 99.060455 316.107361 L 91.248367 266.01355 L 123.865784 230.093994 L 167.677887 233.073853 L 178.872513 236.053772 L 223.248367 270.201477 L 318.040283 343.570496 L 441.825592 434.738342 L 459.946411 449.798706 L 467.194672 444.64447 L 468.080597 441.020203 L 459.946411 427.409485 L 392.617493 305.718323 L 320.778564 181.932983 L 288.80542 130.630859 L 280.348999 99.865845 C 277.369171 87.221436 275.194641 76.590698 275.194641 63.624268 L 312.322174 13.20813 L 332.8591 6.604126 L 382.389313 13.20813 L 403.248352 31.328979 L 434.013519 101.71814 L 483.865753 212.537048 L 561.181274 363.221497 L 583.812134 407.919434 L 595.892639 449.315491 L 600.40271 461.959839 L 608.214783 461.959839 L 608.214783 454.711609 L 614.577271 369.825623 L 626.335632 265.61084 L 637.771851 131.516846 L 641.718201 93.745117 L 660.402832 48.483276 L 697.530334 24.000122 L 726.52356 37.852417 L 750.362549 72 L 747.060486 94.067139 L 732.886047 186.201416 L 705.100708 330.52356 L 686.979919 427.167847 L 697.530334 427.167847 L 709.61084 415.087341 L 758.496704 350.174561 L 840.644348 247.490051 L 876.885925 206.738342 L 919.167847 161.71814 L 946.308838 140.29541 L 997.61084 140.29541 L 1035.38269 196.429626 L 1018.469849 254.416199 L 965.637634 321.422852 L 921.825562 378.201538 L 859.006714 462.765259 L 819.785278 530.41626 L 823.409424 535.812073 L 832.75177 534.92627 L 974.657776 504.724915 L 1051.328979 490.872559 L 1142.818848 475.167786 L 1184.214844 494.496582 L 1188.724854 514.147644 L 1172.456421 554.335693 L 1074.604126 578.496765 L 959.838989 601.449829 L 788.939636 641.879272 L 786.845764 643.409485 L 789.261841 646.389343 L 866.255127 653.637634 L 899.194702 655.409424 L 979.812134 655.409424 L 1129.932861 666.604187 L 1169.154419 692.537109 L 1192.671265 724.268677 L 1188.724854 748.429688 L 1128.322144 779.194641 L 1046.818848 759.865845 L 856.590759 714.604126 L 791.355774 698.335754 L 782.335693 698.335754 L 782.335693 703.731567 L 836.69812 756.885986 L 936.322205 846.845581 L 1061.073975 962.81897 L 1067.436279 991.490112 L 1051.409424 1014.120911 L 1034.496704 1011.704712 L 924.885986 929.234924 L 882.604126 892.107544 L 786.845764 811.48999 L 780.483276 811.48999 L 780.483276 819.946289 L 802.550415 852.241699 L 919.087341 1027.409424 L 925.127625 1081.127686 L 916.671204 1098.604126 L 886.469849 1109.154419 L 853.288696 1103.114136 L 785.073914 1007.355835 L 714.684631 899.516785 L 657.906067 802.872498 L 650.979858 806.81897 L 617.476624 1167.704834 L 601.771851 1186.147705 L 565.530212 1200 L 535.328857 1177.046997 L 519.302124 1139.919556 L 535.328857 1066.550537 L 554.657776 970.792053 L 570.362488 894.68457 L 584.536926 800.134277 L 592.993347 768.724976 L 592.429626 766.630859 L 585.503479 767.516968 L 514.22821 865.369263 L 405.825531 1011.865906 L 320.053711 1103.677979 L 299.516815 1111.812256 L 263.919525 1093.369263 L 267.221497 1060.429688 L 287.114136 1031.114136 L 405.825531 880.107361 L 477.422913 786.52356 L 523.651062 732.483276 L 523.328918 724.671265 L 520.590698 724.671265 L 205.288605 929.395935 L 149.154434 936.644409 L 124.993355 914.01355 L 127.973183 876.885986 L 139.409409 864.80542 L 234.201385 799.570435 L 233.879227 799.8927 Z"
      />
    </svg>
  );
}

export function GeminiLogo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-label="Google Gemini Logo">
      <defs>
        <linearGradient id="gemini-official-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1B72E8" />
          <stop offset="35%" stopColor="#8E44AD" />
          <stop offset="70%" stopColor="#E91E63" />
          <stop offset="100%" stopColor="#FBBC05" />
        </linearGradient>
      </defs>
      <path
        d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z"
        fill="url(#gemini-official-grad)"
      />
    </svg>
  );
}

export function OllamaVllmLogo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="294 159 1405.09 1857.06" fill="none" className={className} aria-label="Ollama Logo">
      <path
        d="M599.877 159.522C582.544 162.322 561.744 171.388 547.077 182.588C502.677 216.322 468.277 287.922 453.744 377.122C448.277 410.855 444.544 457.655 444.544 493.388C444.544 535.522 449.477 589.388 456.544 626.589C458.144 634.855 458.944 642.188 458.277 642.722C457.744 643.255 451.211 648.588 443.877 654.455C418.811 674.455 390.144 705.255 370.411 733.388C332.544 787.122 308.011 848.188 297.744 914.322C293.744 940.455 292.677 993.255 295.877 1019.39C302.944 1079.66 321.077 1130.59 352.144 1177.26L362.277 1192.32L359.344 1197.26C338.544 1232.19 320.811 1282.72 312.544 1331.26C306.011 1369.66 305.211 1379.92 305.211 1431.39C305.211 1483.26 305.877 1493.52 312.011 1529.39C319.344 1572.32 334.277 1617.79 350.944 1648.06C356.411 1657.92 369.744 1678.46 371.344 1679.52C371.877 1679.79 370.277 1684.72 367.744 1690.46C348.544 1732.46 332.144 1788.32 325.344 1835.39C320.544 1867.66 319.877 1878.06 319.877 1912.06C319.877 1955.39 322.277 1976.46 331.344 2010.99L332.677 2016.06H389.744H446.944L443.211 2008.99C420.144 1966.32 418.011 1887.12 437.877 1808.06C446.944 1771.52 457.211 1744.72 476.411 1707.79L487.877 1685.39V1671.66C487.877 1658.86 487.611 1657.39 483.477 1648.99C480.277 1642.59 476.011 1637.12 468.411 1629.66C455.477 1617.12 446.144 1603.92 438.677 1587.66C405.877 1516.46 399.477 1410.72 422.544 1320.59C432.144 1282.99 448.011 1249.52 464.677 1231.26C476.011 1218.72 481.877 1204.72 481.877 1190.19C481.877 1175.12 476.544 1162.72 464.544 1149.79C430.144 1112.99 408.944 1068.19 401.344 1016.06C390.544 941.788 410.144 860.855 454.677 796.722C498.277 733.788 559.477 693.388 627.877 682.589C643.211 680.055 671.877 680.455 687.877 683.388C705.344 686.455 716.277 685.522 727.477 680.188C741.344 673.655 748.277 665.522 756.411 646.855C763.611 630.188 769.211 621.122 784.277 602.322C802.411 579.788 819.877 564.455 847.877 545.922C879.877 524.988 916.277 509.788 952.544 502.455C965.744 499.788 971.877 499.388 996.544 499.388C1021.21 499.388 1027.34 499.788 1040.54 502.455C1093.74 513.255 1146.54 540.722 1188.68 579.655C1197.74 588.055 1219.48 614.988 1226.41 626.188C1229.08 630.588 1233.74 639.922 1236.68 646.855C1244.81 665.522 1251.74 673.655 1265.61 680.188C1276.41 685.388 1287.74 686.455 1304.54 683.655C1331.08 679.122 1351.48 679.522 1377.48 684.855C1466.01 702.722 1543.08 775.655 1577.21 873.388C1606.94 959.122 1598.54 1048.86 1554.28 1117.39C1546.81 1128.99 1539.34 1138.32 1528.54 1149.79C1505.21 1174.72 1505.21 1205.66 1528.41 1231.26C1566.54 1272.99 1590.41 1375.66 1583.21 1466.19C1578.41 1525.92 1563.08 1579.39 1542.01 1609.66C1538.28 1614.99 1530.54 1624.06 1524.68 1629.66C1517.08 1637.12 1512.81 1642.59 1509.61 1648.99C1505.48 1657.39 1505.21 1658.86 1505.21 1671.66V1685.39L1516.68 1707.79C1535.88 1744.72 1546.14 1771.52 1555.21 1808.06C1574.81 1886.06 1573.08 1963.66 1550.68 2007.79C1548.81 2011.52 1547.21 2014.99 1547.21 2015.39C1547.21 2015.79 1572.68 2016.06 1603.88 2016.06H1660.41L1661.88 2010.32C1662.68 2007.26 1664.01 2002.59 1664.68 1999.92C1666.14 1994.06 1669.08 1976.72 1671.48 1960.06C1673.74 1943.26 1673.74 1881.39 1671.48 1862.72C1662.94 1794.99 1648.68 1741.26 1625.34 1690.46C1622.81 1684.72 1621.21 1679.79 1621.74 1679.52C1622.41 1679.12 1626.14 1673.79 1630.14 1667.79C1659.21 1623.79 1677.08 1568.46 1686.14 1495.39C1688.54 1475.26 1688.54 1388.72 1686.14 1369.39C1679.74 1319.52 1672.01 1285.66 1659.21 1251.39C1653.88 1237.12 1639.74 1206.99 1633.74 1197.26L1630.81 1192.32L1640.94 1177.26C1672.01 1130.59 1690.14 1079.66 1697.21 1019.39C1700.41 993.255 1699.34 940.455 1695.34 914.322C1684.94 848.055 1660.54 787.255 1622.68 733.388C1602.94 705.255 1574.28 674.455 1549.21 654.455C1541.88 648.588 1535.34 643.255 1534.81 642.722C1534.14 642.188 1534.94 634.855 1536.54 626.589C1552.68 542.455 1552.14 437.522 1535.21 355.522C1520.54 284.055 1493.88 227.255 1459.48 194.455C1432.01 168.322 1404.01 157.122 1370.41 159.255C1293.34 163.788 1231.21 252.455 1206.68 392.188C1202.68 414.722 1199.21 441.122 1199.21 448.322C1199.21 451.122 1198.68 453.388 1198.01 453.388C1197.34 453.388 1192.14 450.722 1186.54 447.388C1127.08 412.188 1060.94 393.388 996.544 393.388C932.144 393.388 866.011 412.188 806.544 447.388C800.944 450.722 795.744 453.388 795.077 453.388C794.411 453.388 793.877 451.122 793.877 448.322C793.877 440.855 790.277 413.655 786.411 392.188C764.144 266.722 713.077 183.655 645.211 162.722C635.877 159.922 609.344 158.055 599.877 159.522ZM622.544 268.055C641.744 283.255 663.077 326.722 675.344 375.388C677.611 384.188 680.011 394.322 680.677 398.055C681.211 401.655 682.677 409.788 683.877 416.055C689.077 444.322 691.477 474.855 691.744 512.055L691.877 548.722L682.677 562.322L673.477 576.055H652.011C626.944 576.055 602.011 579.255 578.144 585.655C569.611 587.788 561.344 589.922 559.744 590.322C557.211 590.855 556.811 590.055 555.344 579.122C547.477 519.788 547.877 454.055 556.544 399.388C566.144 338.455 588.544 283.255 610.411 266.988C615.611 263.122 616.544 263.255 622.544 268.055ZM1382.81 267.122C1396.01 276.855 1410.54 302.722 1421.34 335.788C1443.08 401.922 1449.21 492.722 1437.74 579.122C1436.28 590.055 1435.88 590.855 1433.34 590.322C1431.74 589.922 1423.48 587.788 1414.94 585.655C1391.08 579.255 1366.14 576.055 1341.08 576.055H1319.61L1310.41 562.322L1301.21 548.722L1301.34 512.055C1301.61 460.322 1306.41 419.922 1317.88 374.988C1330.01 326.722 1351.48 283.255 1370.54 268.055C1376.54 263.255 1377.48 263.122 1382.81 267.122Z"
        fill="#0F172A"
      />
      <path
        d="M975.877 938.189C946.944 940.989 939.077 942.055 925.21 944.855C902.677 949.522 872.544 959.922 851.61 970.189C778.81 1005.79 728.677 1065.12 713.344 1133.79C710.277 1147.39 709.877 1151.92 709.877 1174.86C709.877 1197.52 710.277 1202.46 713.21 1215.39C733.61 1305.12 816.277 1371.39 923.21 1383.52C946.41 1386.06 1046.68 1386.06 1069.88 1383.52C1155.74 1373.79 1229.61 1327.26 1262.81 1261.92C1271.61 1244.46 1275.88 1233.12 1279.88 1215.39C1282.81 1202.46 1283.21 1197.52 1283.21 1174.86C1283.21 1151.92 1282.81 1147.39 1279.74 1133.79C1257.48 1034.06 1160.68 955.522 1042.01 940.589C1026.54 938.722 986.01 937.122 975.877 938.189ZM1025.74 1010.72C1065.34 1014.99 1105.21 1029.12 1137.21 1050.46C1154.41 1061.92 1178.68 1085.92 1189.08 1101.66C1201.88 1121.12 1209.21 1140.99 1212.54 1165.12C1214.01 1176.19 1213.21 1184.59 1209.21 1202.46C1202.94 1229.12 1183.48 1256.99 1157.21 1276.46C1144.94 1285.39 1119.48 1298.32 1103.88 1303.39C1074.28 1312.86 1054.94 1314.59 985.877 1314.06C940.81 1313.66 932.81 1313.26 919.877 1310.86C875.744 1302.59 840.81 1284.99 815.477 1258.19C794.944 1236.59 785.61 1216.86 780.544 1184.99C778.277 1170.19 782.544 1145.66 791.21 1124.99C801.744 1099.79 828.944 1068.46 855.877 1050.46C887.077 1029.66 928.144 1014.86 965.877 1010.86C980.41 1009.26 1011.21 1009.26 1025.74 1010.72Z"
        fill="#0F172A"
      />
      <path
        d="M945.61 1108.06C935.477 1113.52 928.41 1127.39 930.543 1137.66C932.943 1148.72 942.677 1159.92 957.877 1169.12C966.01 1174.06 966.543 1174.72 966.943 1179.66C967.21 1182.59 966.143 1190.99 964.677 1198.46C963.077 1205.79 961.877 1213.52 961.877 1215.66C962.01 1221.39 967.343 1230.72 972.943 1235.26C977.877 1239.26 978.81 1239.39 992.677 1239.79C1005.34 1240.19 1008.01 1239.92 1013.08 1237.52C1026.14 1231.12 1029.48 1219.39 1024.68 1196.86C1020.68 1178.06 1021.48 1175.12 1031.48 1169.39C1042.01 1163.26 1053.21 1152.46 1056.54 1145.12C1062.94 1131.12 1057.08 1115.26 1042.94 1107.92C1039.48 1106.19 1035.21 1105.39 1028.94 1105.39C1019.21 1105.39 1012.94 1107.66 1001.48 1114.99L994.943 1119.12L990.81 1116.59C973.877 1106.59 970.81 1105.39 960.543 1105.52C953.21 1105.52 949.21 1106.19 945.61 1108.06Z"
        fill="#0F172A"
      />
      <path
        d="M621.878 953.255C598.278 960.722 580.678 978.055 571.611 1002.72C567.211 1014.46 565.078 1032.99 566.945 1042.99C571.345 1066.86 590.945 1088.59 613.211 1094.59C641.211 1101.92 662.145 1097.12 680.678 1078.72C691.478 1068.19 697.345 1058.99 703.211 1044.06C707.478 1033.52 707.745 1031.66 707.745 1016.72L707.878 1000.72L702.278 989.255C693.345 971.122 677.211 957.655 658.545 952.722C648.011 950.055 631.078 950.189 621.878 953.255Z"
        fill="#0F172A"
      />
      <path
        d="M1334.01 952.855C1315.74 957.789 1299.48 971.389 1290.81 989.255L1285.21 1000.72L1285.34 1016.72C1285.34 1031.66 1285.61 1033.52 1289.88 1044.06C1295.74 1058.99 1301.61 1068.19 1312.41 1078.72C1330.94 1097.12 1351.88 1101.92 1379.88 1094.59C1396.01 1090.32 1412.14 1076.72 1419.88 1060.86C1426.54 1047.39 1428.14 1037.66 1426.01 1022.32C1421.08 987.255 1400.54 961.789 1370.01 952.855C1361.08 950.189 1343.74 950.189 1334.01 952.855Z"
        fill="#0F172A"
      />
    </svg>
  );
}

/**
 * Returns a colorful brand logo for any individual model option based on its model ID
 */
export function ModelFamilyIcon({ modelId, className = "size-4" }: { modelId: string; className?: string }) {
  const lower = modelId.toLowerCase();
  if (lower.includes("openai") || lower.includes("gpt") || lower.includes("o1") || lower.includes("o3") || lower.includes("o4")) {
    return <OpenAILogo className={className} />;
  }
  if (lower.includes("anthropic") || lower.includes("claude")) {
    return <AnthropicLogo className={className} />;
  }
  if (lower.includes("google") || lower.includes("gemini") || lower.includes("gemma")) {
    return <GeminiLogo className={className} />;
  }
  if (lower.includes("meta") || lower.includes("llama")) {
    return (
      <svg viewBox="0 0 24 24" fill="#0081FB" className={className} aria-label="Meta Llama Logo">
        <path d="M12 4.5C7.3 4.5 3.5 7.9 3.5 12s3.8 7.5 8.5 7.5 8.5-3.4 8.5-7.5-3.8-7.5-8.5-7.5zm-2.8 10.2c-1.8 0-3.2-1.3-3.2-3s1.4-3 3.2-3c1.2 0 2.2.6 2.7 1.5-.5 1-1.4 2.2-2.7 4.5zm5.6 0c-1.3-2.3-2.2-3.5-2.7-4.5.5-.9 1.5-1.5 2.7-1.5 1.8 0 3.2 1.3 3.2 3s-1.4 3-3.2 3z" />
      </svg>
    );
  }
  if (lower.includes("mistral") || lower.includes("mixtral") || lower.includes("codestral")) {
    return (
      <svg viewBox="0 0 24 24" fill="#FF7000" className={className} aria-label="Mistral Logo">
        <path d="M3 5h4v14H3V5zm7 0h4v14h-4V5zm7 0h4v14h-4V5z" />
      </svg>
    );
  }
  if (lower.includes("deepseek")) {
    return (
      <svg viewBox="0 0 24 24" fill="#4D6BFE" className={className} aria-label="DeepSeek Logo">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14.5v-2.1c1.8-.3 3.1-1.9 3.1-3.9 0-2.2-1.8-4-4-4s-4 1.8-4 4c0 2 1.3 3.6 3.1 3.9v2.1c-3-.4-5.3-2.9-5.3-6 0-3.3 2.7-6 6-6s6 2.7 6 6c0 3.1-2.3 5.6-5.3 6z" />
      </svg>
    );
  }
  if (lower.includes("qwen")) {
    return (
      <svg viewBox="0 0 24 24" fill="#615CED" className={className} aria-label="Qwen Logo">
        <path d="M12 2L2 7l10 5 10-5-10-5zm0 9l-10-5v10l10 5 10-5V6l-10 5z" />
      </svg>
    );
  }
  return <MaterialSymbol name="smart_toy" className={`text-primary ${className}`} />;
}

function ProviderBrandIcon({
  provider,
  className = "size-6",
}: {
  provider: LlmProviderType;
  className?: string;
}) {
  switch (provider) {
    case "openrouter":
      return <OpenRouterLogo className={className} />;
    case "openai":
      return <OpenAILogo className={className} />;
    case "anthropic":
      return <AnthropicLogo className={className} />;
    case "gemini":
      return <GeminiLogo className={className} />;
    case "custom":
      return <OllamaVllmLogo className={className} />;
    default:
      return <MaterialSymbol name="smart_toy" className={className} />;
  }
}

const PROVIDER_METADATA: Record<LlmProviderType, {
  name: string;
  description: string;
  defaultUrl: string;
  defaultModel: string;
  urlLabel: string;
  urlPlaceholder: string;
  supportsCustomUrl: boolean;
  keyRequired: boolean;
  keyPlaceholder: string;
  maxOutputTokens: number;
  maxTemperature: number;
}> = {
  openrouter: {
    name: "OpenRouter",
    description: "Access 300+ models (GPT-4, Claude, Gemini, Llama, Mistral) via a single API",
    defaultUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4.1-mini",
    urlLabel: "Base URL (Optional)",
    urlPlaceholder: "https://openrouter.ai/api/v1",
    supportsCustomUrl: true,
    keyRequired: true,
    keyPlaceholder: "sk-or-v1-...",
    maxOutputTokens: 131072,
    maxTemperature: 2.0,
  },
  openai: {
    name: "OpenAI",
    description: "Direct OpenAI integration (GPT-5.6 Sol/Terra/Luna, GPT-5.5, GPT-5.4, GPT-4.1)",
    defaultUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.6-sol",
    urlLabel: "Base URL (Optional / Azure)",
    urlPlaceholder: "https://api.openai.com/v1",
    supportsCustomUrl: true,
    keyRequired: true,
    keyPlaceholder: "sk-proj-...",
    maxOutputTokens: 65536,
    maxTemperature: 2.0,
  },
  anthropic: {
    name: "Anthropic Claude",
    description: "Direct Anthropic integration (Claude Opus 5, Sonnet 5, Fable 5, Claude 4.8-4.0)",
    defaultUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-5",
    urlLabel: "Base URL (Optional / Bedrock / Proxy)",
    urlPlaceholder: "https://api.anthropic.com",
    supportsCustomUrl: true,
    keyRequired: true,
    keyPlaceholder: "sk-ant-api03-...",
    maxOutputTokens: 128000,
    maxTemperature: 1.0,
  },
  gemini: {
    name: "Google Gemini",
    description: "Direct Google AI Studio integration (Gemini 3.7 Flash, 3.6, 3.5, 3.1 Pro, 2.5 Pro)",
    defaultUrl: "https://generativelanguage.googleapis.com",
    defaultModel: "gemini-3.7-flash",
    urlLabel: "Base URL (Optional)",
    urlPlaceholder: "https://generativelanguage.googleapis.com",
    supportsCustomUrl: false,
    keyRequired: true,
    keyPlaceholder: "AIzaSy...",
    maxOutputTokens: 65536,
    maxTemperature: 2.0,
  },
  custom: {
    name: "Custom / Local",
    description: "Local or private OpenAI-compatible servers (vLLM, Ollama, LM Studio, LiteLLM)",
    defaultUrl: "http://localhost:11434/v1",
    defaultModel: "",
    urlLabel: "Base URL (Required)",
    urlPlaceholder: "http://10.239.37.110:8000/v1 or http://localhost:11434/v1",
    supportsCustomUrl: true,
    keyRequired: false,
    keyPlaceholder: "Optional authorization token...",
    maxOutputTokens: 131072,
    maxTemperature: 2.0,
  },
};

function ModelSelectorDropdown({
  models,
  selectedModel,
  onSelect,
}: {
  models: ModelOption[];
  selectedModel: string;
  onSelect: (modelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const filtered = models.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return m.id.toLowerCase().includes(q) || (m.name && m.name.toLowerCase().includes(q));
  });

  const selectedItem = models.find((m) => m.id === selectedModel);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex min-w-[220px] max-w-full items-center justify-between gap-2 rounded-lg border border-outline-variant bg-surface-container px-3 py-2.5 text-xs text-on-surface outline-none transition hover:bg-surface-container-high focus:border-primary"
      >
        <div className="flex items-center gap-2 truncate">
          {selectedItem ? (
            <>
              <ModelFamilyIcon modelId={selectedItem.id} className="size-4 shrink-0" />
              <span className="truncate font-medium">{selectedItem.name || selectedItem.id}</span>
              {selectedItem.context_length && (
                <span className="rounded bg-surface-container-highest px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant">
                  {Math.round(selectedItem.context_length / 1000)}k
                </span>
              )}
            </>
          ) : (
            <span className="text-on-surface-variant">Browse models ({models.length})</span>
          )}
        </div>
        <MaterialSymbol name={open ? "expand_less" : "expand_more"} className="text-base text-on-surface-variant shrink-0" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 max-h-80 w-84 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-high shadow-2xl backdrop-blur-xl">
          <div className="border-b border-outline-variant/60 p-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container px-2.5 py-1.5">
              <MaterialSymbol name="search" className="text-sm text-on-surface-variant" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${models.length} models...`}
                className="w-full bg-transparent text-xs text-on-surface outline-none placeholder:text-on-surface-variant/50"
                autoFocus
              />
              {search && (
                <button type="button" onClick={() => setSearch("")} className="text-on-surface-variant hover:text-on-surface">
                  <MaterialSymbol name="close" className="text-xs" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto p-1.5 space-y-0.5">
            {filtered.length === 0 ? (
              <div className="py-4 text-center text-xs text-on-surface-variant">
                No matching models found
              </div>
            ) : (
              filtered.map((m) => {
                const isSelected = m.id === selectedModel;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onSelect(m.id);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={`flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition ${
                      isSelected
                        ? "bg-primary text-on-primary font-semibold"
                        : "text-on-surface hover:bg-surface-container-highest"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <ModelFamilyIcon modelId={m.id} className="size-4 shrink-0" />
                      <div className="truncate">
                        <div className="truncate text-xs leading-tight">{m.name || m.id}</div>
                        <div className={`truncate font-mono text-[10px] ${isSelected ? "text-on-primary/75" : "text-on-surface-variant"}`}>
                          {m.id}
                        </div>
                      </div>
                    </div>
                    {m.context_length && (
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono ${
                          isSelected ? "bg-on-primary/20 text-on-primary" : "bg-surface-container text-on-surface-variant"
                        }`}
                      >
                        {Math.round(m.context_length / 1000)}k ctx
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type ProviderFormState = {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  contextLimit: string;
  showKey: boolean;
};

export function LlmSettingsCard({
  settings,
  onChange,
}: {
  settings: LlmSettingsOut | null;
  onChange: (next: LlmSettingsOut) => void;
}) {
  const [selectedProvider, setSelectedProvider] = useState<LlmProviderType>(
    settings?.active_provider || "openrouter",
  );
  const [activeProvider, setActiveProvider] = useState<LlmProviderType>(
    settings?.active_provider || "openrouter",
  );

  // Form states per provider
  const [formState, setFormState] = useState<Record<LlmProviderType, ProviderFormState>>({
    openrouter: {
      apiKey: "",
      baseUrl: "",
      model: "openai/gpt-4.1-mini",
      temperature: 0.7,
      maxTokens: 8192,
      contextLimit: "",
      showKey: false,
    },
    openai: {
      apiKey: "",
      baseUrl: "",
      model: "gpt-5.6-sol",
      temperature: 0.7,
      maxTokens: 16384,
      contextLimit: "",
      showKey: false,
    },
    anthropic: {
      apiKey: "",
      baseUrl: "",
      model: "claude-sonnet-5",
      temperature: 1.0,
      maxTokens: 16384,
      contextLimit: "",
      showKey: false,
    },
    gemini: {
      apiKey: "",
      baseUrl: "",
      model: "gemini-3.7-flash",
      temperature: 0.7,
      maxTokens: 8192,
      contextLimit: "",
      showKey: false,
    },
    custom: {
      apiKey: "",
      baseUrl: "http://localhost:11434/v1",
      model: "",
      temperature: 0.7,
      maxTokens: 8192,
      contextLimit: "32768",
      showKey: false,
    },
  });

  // Model discovery cache
  const [discoveredModels, setDiscoveredModels] = useState<
    Partial<Record<LlmProviderType, ModelOption[]>>
  >({});
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchModelsError, setFetchModelsError] = useState<string | null>(null);

  // Test connection state
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<TestLlmConnectionOut | null>(null);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ message?: string; error?: string } | null>(null);

  // Sync incoming props into state
  useEffect(() => {
    if (!settings) return;
    setActiveProvider(settings.active_provider || "openrouter");
    setFormState((prev) => {
      const next = { ...prev };
      for (const [pKey, pConfig] of Object.entries(settings.providers || {})) {
        const key = pKey as LlmProviderType;
        if (pConfig && next[key]) {
          next[key] = {
            ...next[key],
            baseUrl: pConfig.base_url || "",
            model: pConfig.model || PROVIDER_METADATA[key].defaultModel,
            temperature: pConfig.temperature ?? 0.7,
            maxTokens: pConfig.max_tokens ?? 4096,
            contextLimit: pConfig.context_limit ? String(pConfig.context_limit) : "",
          };
        }
      }
      return next;
    });
  }, [settings]);

  // Auto-fetch models on provider selection if not yet cached
  useEffect(() => {
    if (!discoveredModels[selectedProvider]) {
      api<FetchModelsOut>("/org/settings/llm/fetch-models", {
        method: "POST",
        json: {
          provider: selectedProvider,
          api_key: formState[selectedProvider].apiKey,
          base_url: formState[selectedProvider].baseUrl,
        },
      })
        .then((res) => {
          if (res.models?.length > 0) {
            setDiscoveredModels((prev) => ({
              ...prev,
              [selectedProvider]: res.models,
            }));
          }
        })
        .catch(() => {
          // Ignore auto-fetch background errors
        });
    }
  }, [selectedProvider]);

  const currentMeta = PROVIDER_METADATA[selectedProvider];
  const currentForm = formState[selectedProvider];
  const currentSavedConfig = settings?.providers?.[selectedProvider];

  const updateCurrent = (patch: Partial<ProviderFormState>) => {
    setFormState((prev) => ({
      ...prev,
      [selectedProvider]: {
        ...prev[selectedProvider],
        ...patch,
      },
    }));
    setSaveStatus(null);
    setTestResult(null);
  };

  const handleFetchModels = async () => {
    setFetchingModels(true);
    setFetchModelsError(null);
    try {
      const res = await api<FetchModelsOut>("/org/settings/llm/fetch-models", {
        method: "POST",
        json: {
          provider: selectedProvider,
          api_key: currentForm.apiKey,
          base_url: currentForm.baseUrl,
        },
      });
      setDiscoveredModels((prev) => ({
        ...prev,
        [selectedProvider]: res.models,
      }));
      if (res.models.length > 0 && !currentForm.model) {
        updateCurrent({ model: res.models[0].id });
      }
    } catch (err) {
      setFetchModelsError(
        err instanceof ApiError ? err.message : "Failed to fetch models from provider",
      );
    } finally {
      setFetchingModels(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await api<TestLlmConnectionOut>("/org/settings/llm/test-connection", {
        method: "POST",
        json: {
          provider: selectedProvider,
          api_key: currentForm.apiKey,
          base_url: currentForm.baseUrl,
          model: currentForm.model,
          temperature: currentForm.temperature,
        },
      });
      setTestResult(res);
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof ApiError ? err.message : "Connection request failed",
        latency_ms: 0,
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus(null);
    try {
      const payloadProviders: Record<string, unknown> = {};
      for (const [pKey, pState] of Object.entries(formState)) {
        payloadProviders[pKey] = {
          api_key: pState.apiKey,
          base_url: pState.baseUrl,
          model: pState.model,
          temperature: pState.temperature,
          max_tokens: pState.maxTokens,
          context_limit: pState.contextLimit ? parseInt(pState.contextLimit, 10) : null,
        };
      }

      const updated = await api<LlmSettingsOut>("/org/settings/llm", {
        method: "PATCH",
        json: {
          active_provider: activeProvider,
          providers: payloadProviders,
        },
      });

      onChange(updated);
      setSaveStatus({ message: "LLM configuration saved successfully" });
      // Reset sensitive input fields
      setFormState((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next) as LlmProviderType[]) {
          next[k] = { ...next[k], apiKey: "" };
        }
        return next;
      });
    } catch (err) {
      setSaveStatus({
        error: err instanceof ApiError ? err.message : "Failed to save configuration",
      });
    } finally {
      setSaving(false);
    }
  };

  const modelsList = discoveredModels[selectedProvider] || [];

  return (
    <SettingsCard
      icon="neurology"
      title="LLM Provider Configuration"
      description="Configure model endpoints, API credentials, and default AI engines powering Vrika."
      badge={
        <SettingsBadge tone="active">
          Active: {PROVIDER_METADATA[activeProvider]?.name || activeProvider}
        </SettingsBadge>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <SettingsStatus
              message={saveStatus?.message}
              error={saveStatus?.error}
            />
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow transition hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
          >
            {saving ? (
              <span className="size-4 animate-spin rounded-full border-2 border-on-primary border-t-transparent" />
            ) : (
              <MaterialSymbol name="save" className="text-base" />
            )}
            Save Configuration
          </button>
        </div>
      }
    >
      {/* Provider Selector Tabs */}
      <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {(Object.keys(PROVIDER_METADATA) as LlmProviderType[]).map((pKey) => {
          const meta = PROVIDER_METADATA[pKey];
          const isSelected = selectedProvider === pKey;
          const isActive = activeProvider === pKey;
          const hasKey = settings?.providers?.[pKey]?.has_api_key;

          return (
            <button
              key={pKey}
              type="button"
              onClick={() => {
                setSelectedProvider(pKey);
                setTestResult(null);
                setFetchModelsError(null);
              }}
              className={`relative flex flex-col items-start rounded-xl border p-3.5 text-left transition-all ${
                isSelected
                  ? "border-primary bg-primary-container/20 ring-2 ring-primary/30"
                  : "border-outline-variant bg-surface-container hover:bg-surface-container-high"
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <div className="flex size-9 items-center justify-center rounded-lg bg-surface-container-high/40 p-1 shadow-sm">
                  <ProviderBrandIcon provider={pKey} className="size-7 shrink-0" />
                </div>
                {isActive && (
                  <span className="flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                    <span className="size-1.5 rounded-full bg-primary" />
                    Active
                  </span>
                )}
              </div>
              <div className="mt-2.5">
                <div className="text-sm font-bold text-on-surface">{meta.name}</div>
                <div className="mt-0.5 text-[11px] text-on-surface-variant line-clamp-1">
                  {hasKey || pKey === "custom" ? "Configured" : "Not set"}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Provider Banner */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-surface-container-high/50 p-1 shadow-sm">
            <ProviderBrandIcon provider={selectedProvider} className="size-8 shrink-0" />
          </div>
          <div>
            <div className="text-sm font-semibold text-on-surface">
              {currentMeta.name}
            </div>
            <div className="text-xs text-on-surface-variant">
              {activeProvider === selectedProvider
                ? "Currently set as default AI engine for scans & agent chat"
                : "Configure settings below or set as active provider"}
            </div>
          </div>
        </div>

        {activeProvider !== selectedProvider && (
          <button
            type="button"
            onClick={() => setActiveProvider(selectedProvider)}
            className="flex items-center gap-1.5 rounded-lg border border-primary bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary hover:text-on-primary"
          >
            <MaterialSymbol name="star" className="text-sm" />
            Set as Active Provider
          </button>
        )}
      </div>

      {/* Form Fields for Selected Provider */}
      <div className="space-y-5">
        {/* API Key */}
        <div>
          <label className="block text-xs font-semibold text-on-surface">
            API Key {currentMeta.keyRequired && <span className="text-error">*</span>}
          </label>
          <div className="relative mt-1.5 flex items-center">
            <input
              type={currentForm.showKey ? "text" : "password"}
              value={currentForm.apiKey}
              onChange={(e) => updateCurrent({ apiKey: e.target.value })}
              placeholder={
                currentSavedConfig?.has_api_key
                  ? "•••••••••••••••• (Leave blank to keep stored key)"
                  : currentMeta.keyPlaceholder
              }
              className="w-full rounded-lg border border-outline-variant bg-surface-container px-3.5 py-2.5 pr-20 font-mono text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <div className="absolute right-2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => updateCurrent({ showKey: !currentForm.showKey })}
                className="rounded p-1 text-on-surface-variant hover:text-on-surface"
                title={currentForm.showKey ? "Hide key" : "Show key"}
              >
                <MaterialSymbol
                  name={currentForm.showKey ? "visibility_off" : "visibility"}
                  className="text-base"
                />
              </button>
              {currentSavedConfig?.has_api_key && !currentForm.apiKey && (
                <span className="flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  <MaterialSymbol name="lock" className="text-xs" />
                  Saved
                </span>
              )}
            </div>
          </div>
          <p className="mt-1 text-[11px] text-on-surface-variant">
            Secrets are encrypted at rest with Fernet and never transmitted to client browsers.
          </p>
        </div>

        {/* Base URL */}
        {currentMeta.supportsCustomUrl && (
          <div>
            <label className="block text-xs font-semibold text-on-surface">
              {currentMeta.urlLabel}
            </label>
            <input
              type="text"
              value={currentForm.baseUrl}
              onChange={(e) => updateCurrent({ baseUrl: e.target.value })}
              placeholder={currentMeta.urlPlaceholder}
              className="mt-1.5 w-full rounded-lg border border-outline-variant bg-surface-container px-3.5 py-2.5 font-mono text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        )}

        {/* Model Selection & Discovery */}
        <div>
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold text-on-surface">
              Model Name / Identifier <span className="text-error">*</span>
            </label>
            <button
              type="button"
              onClick={handleFetchModels}
              disabled={fetchingModels}
              className="flex items-center gap-1 text-xs font-semibold text-primary transition hover:underline disabled:opacity-50"
            >
              {fetchingModels ? (
                <span className="size-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              ) : (
                <MaterialSymbol name="refresh" className="text-sm" />
              )}
              Fetch Available Models
            </button>
          </div>

          <div className="mt-1.5 grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              type="text"
              value={currentForm.model}
              onChange={(e) => updateCurrent({ model: e.target.value })}
              placeholder={currentMeta.defaultModel}
              className="w-full rounded-lg border border-outline-variant bg-surface-container px-3.5 py-2.5 font-mono text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary"
            />

            {modelsList.length > 0 && (
              <ModelSelectorDropdown
                models={modelsList}
                selectedModel={currentForm.model}
                onSelect={(modelId) => updateCurrent({ model: modelId })}
              />
            )}
          </div>

          {fetchModelsError && (
            <p className="mt-1 text-xs text-error">{fetchModelsError}</p>
          )}
        </div>

        {/* Sliders Grid: Temperature & Max Tokens */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Temperature */}
          <div className="rounded-lg border border-outline-variant bg-surface-container p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-on-surface">Temperature</span>
              <span className="rounded bg-surface-container-high px-2 py-0.5 font-mono text-xs font-bold text-primary">
                {currentForm.temperature.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0.0"
              max={String(currentMeta.maxTemperature)}
              step="0.05"
              value={currentForm.temperature}
              onChange={(e) => updateCurrent({ temperature: parseFloat(e.target.value) })}
              className="mt-3 w-full accent-primary"
            />
            <div className="mt-1 flex justify-between text-[10px] text-on-surface-variant">
              <span>0.0 (Precise / Deterministic)</span>
              <span>{currentMeta.maxTemperature.toFixed(1)} (Creative)</span>
            </div>
          </div>

          {/* Max Output Tokens */}
          <div className="rounded-lg border border-outline-variant bg-surface-container p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-on-surface">Max Output Tokens</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={256}
                  max={currentMeta.maxOutputTokens}
                  step={256}
                  value={currentForm.maxTokens}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v)) updateCurrent({ maxTokens: Math.min(v, currentMeta.maxOutputTokens) });
                  }}
                  className="w-24 rounded border border-outline-variant bg-surface-container-high px-2 py-0.5 text-right font-mono text-xs font-bold text-primary outline-none focus:border-primary"
                />
              </div>
            </div>
            <input
              type="range"
              min="256"
              max={String(currentMeta.maxOutputTokens)}
              step="256"
              value={Math.min(currentForm.maxTokens, currentMeta.maxOutputTokens)}
              onChange={(e) => updateCurrent({ maxTokens: parseInt(e.target.value, 10) })}
              className="mt-3 w-full accent-primary"
            />
            <div className="mt-1 flex justify-between text-[10px] text-on-surface-variant">
              <span>256</span>
              <span>{(currentMeta.maxOutputTokens / 1000).toFixed(0)}k</span>
            </div>
          </div>
        </div>

        {/* Custom Context Limit (Optional / Custom) */}
        {selectedProvider === "custom" && (
          <div>
            <label className="block text-xs font-semibold text-on-surface">
              Server Context Window (Optional Hint)
            </label>
            <input
              type="number"
              value={currentForm.contextLimit}
              onChange={(e) => updateCurrent({ contextLimit: e.target.value })}
              placeholder="e.g. 32768, 65536, 128000"
              className="mt-1.5 w-full rounded-lg border border-outline-variant bg-surface-container px-3.5 py-2.5 font-mono text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
        )}

        {/* Test Connection Button & Result */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testingConnection}
            className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container px-4 py-2 text-xs font-semibold text-on-surface transition hover:bg-surface-container-high disabled:opacity-50"
          >
            {testingConnection ? (
              <span className="size-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : (
              <MaterialSymbol name="network_check" className="text-base text-primary" />
            )}
            Test {currentMeta.name} Connection
          </button>

          {testResult && (
            <div
              className={`mt-3 rounded-lg p-3 text-xs ${
                testResult.success
                  ? "border border-primary/30 bg-primary/10 text-on-surface"
                  : "border border-error/30 bg-error-container/30 text-on-error-container"
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                <MaterialSymbol
                  name={testResult.success ? "check_circle" : "error"}
                  className={`text-base ${testResult.success ? "text-primary" : "text-error"}`}
                />
                {testResult.message}
              </div>
              {testResult.response_preview && (
                <div className="mt-1 font-mono text-[11px] opacity-80">
                  Model response: &quot;{testResult.response_preview}&quot;
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </SettingsCard>
  );
}
